import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { addDays, localDate, mondayOf, zonedDateTime } from '@skellobis/labor-rules';
import type { SessionUser } from '../access/session.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import { PlanningService } from '../planning/planning.service.js';
import { canDecide, canSee, routeFor } from './leave.rules.js';

export interface LeaveInput {
  absenceTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dayPart: 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM';
  startTime?: string;
  endTime?: string;
  note?: string;
}

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planning: PlanningService,
  ) {}

  /** The absence types an employee is allowed to ask for. */
  requestableTypes() {
    return this.prisma.absenceType.findMany({
      where: { isActive: true, employeeCanRequest: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // ───────────── Employee side ─────────────

  async create(user: SessionUser, input: LeaveInput) {
    if (!user.employeeId) {
      throw new BadRequestException("Ce compte n'est pas rattaché à un salarié");
    }
    if (input.endDate < input.startDate) {
      throw new BadRequestException('La date de fin est avant la date de début');
    }
    if (input.dayPart !== 'FULL_DAY' && input.startDate !== input.endDate) {
      throw new BadRequestException(
        'Une demi-journée ou des heures précises portent sur un seul jour',
      );
    }
    if (input.dayPart === 'CUSTOM' && (!input.startTime || !input.endTime)) {
      throw new BadRequestException('Indiquez une heure de début et de fin');
    }
    const type = await this.prisma.absenceType.findUnique({
      where: { id: input.absenceTypeId },
    });
    if (!type?.isActive || !type.employeeCanRequest) {
      throw new BadRequestException("Ce type d'absence ne peut pas être demandé");
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
      include: {
        // The main site first: its managers receive the request.
        assignments: { include: { site: true }, orderBy: { isPrimary: 'desc' } },
        posts: { include: { post: true } },
      },
    });
    const site = employee.assignments[0]?.site;
    if (!site) {
      throw new BadRequestException("Vous n'êtes affecté à aucun site");
    }

    // Days off are asked ahead: never for the week in progress. A problem
    // this week goes through a phone call to the manager of the service.
    const nextMonday = addDays(mondayOf(localDate(new Date(), site.timezone)), 7);
    if (input.startDate < nextMonday) {
      throw new BadRequestException(
        'Les congés se demandent au plus tôt pour la semaine prochaine. Pour un empêchement cette semaine, appelez le responsable de votre service.',
      );
    }

    const hasRoleHere = (role: string) =>
      user.grants.some(
        (grant) =>
          grant.role === role && (grant.siteId === null || grant.siteId === site.id),
      );
    const route = routeFor({
      siteType: site.type,
      isSiteDirector: hasRoleHere('SITE_DIRECTOR'),
      isHeadChef: hasRoleHere('HEAD_CHEF'),
      postDepartments: employee.posts.map(({ post }) => post.department),
    });

    const custom = input.dayPart === 'CUSTOM';
    const request = await this.prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        siteId: site.id,
        absenceTypeId: type.id,
        startDate: toDbDate(input.startDate),
        endDate: toDbDate(input.endDate),
        dayPart: input.dayPart,
        startTime: custom ? input.startTime! : null,
        endTime: custom ? input.endTime! : null,
        note: input.note?.trim() || null,
        route,
      },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'leave.request',
      entity: 'LeaveRequest',
      entityId: request.id,
      data: { ...input, route },
    });
    return { id: request.id };
  }

  async mine(user: SessionUser) {
    if (!user.employeeId) return [];
    const requests = await this.prisma.leaveRequest.findMany({
      where: { employeeId: user.employeeId },
      include: { type: true, employee: true, site: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return requests.map((request) => this.present(request));
  }

  /** The employee withdraws a request that has not been decided yet. */
  async cancel(user: SessionUser, id: string) {
    const request = await this.requestOrThrow(id);
    if (request.employeeId !== user.employeeId) throw new ForbiddenException();
    this.assertPending(request.status);
    await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'leave.cancel',
      entity: 'LeaveRequest',
      entityId: id,
    });
    return { ok: true };
  }

  // ───────────── Manager side ─────────────

  /**
   * The requests this person may see: the ones they decide, plus, for a site
   * director or multi-site manager, every request of their restaurants.
   */
  async inbox(user: SessionUser, onlyPending: boolean) {
    const allSites = user.grants.some((grant) => grant.siteId === null);
    const siteIds = user.grants.map((grant) => grant.siteId!).filter(Boolean);
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        ...(allSites ? {} : { siteId: { in: siteIds } }),
        ...(onlyPending ? { status: 'PENDING' } : {}),
      },
      include: { type: true, employee: true, site: true },
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
      take: 200,
    });

    const visible = [];
    for (const request of requests) {
      if (!canSee(user.grants, request)) continue;
      const pending = request.status === 'PENDING';

      // Shifts already planned over the period: the approver should know.
      const from = zonedDateTime(fromDbDate(request.startDate), '00:00', request.site.timezone);
      const to = zonedDateTime(
        addDays(fromDbDate(request.endDate), 1),
        '00:00',
        request.site.timezone,
      );
      const plannedShifts = pending
        ? await this.prisma.shift.count({
            where: { employeeId: request.employeeId, startsAt: { gte: from, lt: to } },
          })
        : 0;

      visible.push({
        ...this.present(request),
        plannedShifts,
        // Nobody decides their own request.
        canDecide:
          pending &&
          request.employeeId !== user.employeeId &&
          canDecide(user.grants, request),
      });
    }
    return visible;
  }

  /** The final decision. Approving puts the absence on the planning. */
  async decide(user: SessionUser, id: string, approve: boolean, note?: string) {
    const request = await this.requestOrThrow(id);
    if (
      request.employeeId === user.employeeId ||
      !canDecide(user.grants, request)
    ) {
      throw new ForbiddenException();
    }
    this.assertPending(request.status);

    const decision = {
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote: note?.trim() || null,
    };
    if (approve) {
      // A locked day cannot receive a new absence.
      await this.planning.assertRangeOpen(
        request.siteId,
        fromDbDate(request.startDate),
        fromDbDate(request.endDate),
      );
      // Both changes succeed or neither does.
      await this.prisma.$transaction(async (tx) => {
        const absence = await tx.absence.create({
          data: {
            employeeId: request.employeeId,
            absenceTypeId: request.absenceTypeId,
            startDate: request.startDate,
            endDate: request.endDate,
            dayPart: request.dayPart,
            startTime: request.startTime,
            endTime: request.endTime,
            note: request.note,
            createdById: user.id,
          },
        });
        await tx.leaveRequest.update({
          where: { id },
          data: { ...decision, status: 'APPROVED', absenceId: absence.id },
        });
      });
    } else {
      await this.prisma.leaveRequest.update({
        where: { id },
        data: { ...decision, status: 'REFUSED' },
      });
    }
    await this.audit.record({
      actorUserId: user.id,
      action: approve ? 'leave.approve' : 'leave.refuse',
      entity: 'LeaveRequest',
      entityId: id,
      data: { note: decision.decisionNote },
    });
    return { ok: true };
  }

  // ───────────── Helpers ─────────────

  private async requestOrThrow(id: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException();
    return request;
  }

  private assertPending(status: string) {
    if (status !== 'PENDING') {
      throw new ConflictException('Cette demande a déjà été traitée');
    }
  }

  /** The shape sent to the web app. */
  private present(request: {
    id: string;
    employee: { id: string; firstName: string; lastName: string };
    site: { id: string; name: string };
    type: { name: string };
    startDate: Date;
    endDate: Date;
    dayPart: string;
    startTime: string | null;
    endTime: string | null;
    note: string | null;
    route: string;
    status: string;
    decisionNote: string | null;
    createdAt: Date;
  }) {
    return {
      id: request.id,
      employee: {
        id: request.employee.id,
        firstName: request.employee.firstName,
        lastName: request.employee.lastName,
      },
      site: { id: request.site.id, name: request.site.name },
      typeName: request.type.name,
      startDate: fromDbDate(request.startDate),
      endDate: fromDbDate(request.endDate),
      dayPart: request.dayPart,
      startTime: request.startTime,
      endTime: request.endTime,
      note: request.note,
      route: request.route,
      status: request.status,
      decisionNote: request.decisionNote,
      createdAt: request.createdAt,
    };
  }
}
