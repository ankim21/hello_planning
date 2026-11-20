import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service.js';
import { can } from '../access/permissions.js';
import type { SessionUser } from '../access/session.js';
import { AuditService } from '../core/audit.service.js';
import { NotifyService } from '../core/notify.service.js';
import { PrismaService } from '../core/prisma.service.js';

/**
 * Taking someone off a planning for good.
 *
 * A site director cannot archive an employee alone: they ask, and HR decides.
 * So that the planning is clean at once, the person stops showing on that
 * site's planning as soon as the request is made. Approved, the employee
 * record is archived; refused or cancelled, the person is back.
 */
@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
  ) {}

  /** The employees hidden from a site's planning while HR decides. */
  async pendingAt(siteId: string) {
    const requests = await this.prisma.archiveRequest.findMany({
      where: { siteId, status: 'PENDING' },
      include: { employee: true },
      orderBy: { requestedAt: 'asc' },
    });
    return requests.map((request) => ({
      id: request.id,
      employee: {
        id: request.employee.id,
        firstName: request.employee.firstName,
        lastName: request.employee.lastName,
      },
      reason: request.reason,
      requestedAt: request.requestedAt,
    }));
  }

  /** Shifts still to come, from now on. They must go before the person can. */
  private upcomingShifts(employeeId: string, siteId?: string) {
    return this.prisma.shift.count({
      where: { employeeId, siteId, endsAt: { gt: new Date() } },
    });
  }

  /** The site asks: the person leaves its planning, and HR is told. */
  async request(user: SessionUser, siteId: string, employeeId: string, reason?: string) {
    this.access.assert(user, 'employee.archiveRequest', siteId);
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, isActive: true, assignments: { some: { siteId } } },
    });
    if (!site || !employee) throw new NotFoundException();

    const waiting = await this.prisma.archiveRequest.findFirst({
      where: { siteId, employeeId, status: 'PENDING' },
    });
    if (waiting) throw new ConflictException("Une demande d'archivage est déjà en attente");

    const shifts = await this.upcomingShifts(employeeId, siteId);
    if (shifts > 0) {
      throw new ConflictException(
        `${employee.firstName} a encore ${shifts} shift${shifts > 1 ? 's' : ''} à venir : retirez-les ou donnez-les à quelqu'un d'autre d'abord`,
      );
    }

    const created = await this.prisma.archiveRequest.create({
      data: { siteId, employeeId, reason: reason?.trim() || null, requestedById: user.id },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'archive.request',
      entity: 'Employee',
      entityId: employeeId,
      data: { siteId, reason: created.reason },
    });

    // HR decides; administrators can too, and are told as well.
    const deciders = await this.prisma.roleGrant.findMany({
      where: {
        role: { in: ['HR', 'ADMIN'] },
        OR: [{ siteId: null }, { siteId }],
        user: { isActive: true },
      },
      select: { userId: true },
    });
    await this.notify.users(
      deciders.map((grant) => grant.userId),
      {
        title: "Demande d'archivage",
        body: `${site.name} demande d'archiver ${employee.firstName} ${employee.lastName}${created.reason ? ` : ${created.reason}` : ''}`,
        link: '/demandes',
      },
      user.id,
    );
    return { id: created.id };
  }

  /** The requests this person decides (HR) or made for their sites. */
  async inbox(user: SessionUser) {
    const requests = await this.prisma.archiveRequest.findMany({
      include: { employee: true, site: true },
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });
    const names = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: requests.flatMap((r) => [r.requestedById, r.decidedById ?? '']) } },
          include: { employee: true },
        })
      ).map((account) => [
        account.id,
        account.employee
          ? `${account.employee.firstName} ${account.employee.lastName}`
          : account.email,
      ]),
    );
    return requests
      .filter(
        (request) =>
          can(user.grants, 'employee.archive', request.siteId) ||
          can(user.grants, 'employee.archiveRequest', request.siteId),
      )
      .map((request) => ({
        id: request.id,
        employee: {
          id: request.employee.id,
          firstName: request.employee.firstName,
          lastName: request.employee.lastName,
        },
        site: { id: request.site.id, name: request.site.name },
        reason: request.reason,
        status: request.status,
        requestedBy: names.get(request.requestedById) ?? '',
        requestedAt: request.requestedAt,
        decidedBy: request.decidedById ? (names.get(request.decidedById) ?? '') : null,
        decidedAt: request.decidedAt,
        decisionNote: request.decisionNote,
        canDecide:
          request.status === 'PENDING' && can(user.grants, 'employee.archive', request.siteId),
        canCancel:
          request.status === 'PENDING' &&
          can(user.grants, 'employee.archiveRequest', request.siteId),
      }));
  }

  private async pendingOrThrow(id: string) {
    const request = await this.prisma.archiveRequest.findUnique({
      where: { id },
      include: { employee: true, site: true },
    });
    if (!request) throw new NotFoundException();
    if (request.status !== 'PENDING') {
      throw new ConflictException('Cette demande a déjà été traitée');
    }
    return request;
  }

  /** HR approves (the employee record is archived) or refuses (the person is back). */
  async decide(user: SessionUser, id: string, approve: boolean, note?: string) {
    const request = await this.pendingOrThrow(id);
    this.access.assert(user, 'employee.archive', request.siteId);
    const { employee, site } = request;

    if (approve) {
      // Archiving takes the person off every planning, so nothing may be
      // planned for them anywhere.
      const shifts = await this.upcomingShifts(employee.id);
      if (shifts > 0) {
        throw new BadRequestException(
          `${employee.firstName} a encore ${shifts} shift${shifts > 1 ? 's' : ''} à venir dans un restaurant : l'archivage attendra qu'ils soient retirés`,
        );
      }
    }
    await this.prisma.$transaction([
      this.prisma.archiveRequest.update({
        where: { id },
        data: {
          status: approve ? 'APPROVED' : 'REFUSED',
          decidedById: user.id,
          decidedAt: new Date(),
          decisionNote: note?.trim() || null,
        },
      }),
      ...(approve
        ? [
            this.prisma.employee.update({ where: { id: employee.id }, data: { isActive: false } }),
            // The same person asked for at another site: settled too.
            this.prisma.archiveRequest.updateMany({
              where: { employeeId: employee.id, status: 'PENDING', id: { not: id } },
              data: { status: 'APPROVED', decidedById: user.id, decidedAt: new Date() },
            }),
          ]
        : []),
    ]);
    await this.audit.record({
      actorUserId: user.id,
      action: approve ? 'archive.approve' : 'archive.refuse',
      entity: 'Employee',
      entityId: employee.id,
      data: { siteId: request.siteId, note: note?.trim() || null },
    });
    await this.notify.users(
      [request.requestedById],
      {
        title: approve ? 'Archivage accepté' : 'Archivage refusé',
        body: approve
          ? `${employee.firstName} ${employee.lastName} est archivé.`
          : `${employee.firstName} ${employee.lastName} revient sur le planning de ${site.name}${note?.trim() ? ` : ${note.trim()}` : '.'}`,
        link: approve ? '/demandes' : `/sites/${site.id}/planning`,
      },
      user.id,
    );
    return { status: approve ? 'APPROVED' : 'REFUSED' };
  }

  /** The site changes its mind: the person is back on the planning. */
  async cancel(user: SessionUser, id: string) {
    const request = await this.pendingOrThrow(id);
    this.access.assert(user, 'employee.archiveRequest', request.siteId);
    await this.prisma.archiveRequest.update({
      where: { id },
      data: { status: 'CANCELLED', decidedById: user.id, decidedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'archive.cancel',
      entity: 'Employee',
      entityId: request.employeeId,
      data: { siteId: request.siteId },
    });
    return { status: 'CANCELLED' };
  }
}
