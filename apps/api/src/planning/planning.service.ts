import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  localDate,
  localTime,
  plannedMinutes,
  shiftInstants,
  zonedDateTime,
} from '@skellobis/labor-rules';
import { AccessService } from '../access/access.service.js';
import { can } from '../access/permissions.js';
import { canDecide } from '../leave/leave.rules.js';
import type { SessionUser } from '../access/session.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import { DEPARTMENTS, PublicationService } from './publication.service.js';
import type { DayLockStatus, Department } from '../generated/prisma/enums.js';

/** A shift as the planner types it: wall-clock times on one day at the site. */
export interface ShiftInput {
  employeeId: string;
  postId: string;
  service: 'AM' | 'PM';
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM, next day when at or before start
  breakMinutes: number;
  meals: number;
  note?: string;
}

export interface AbsenceInput {
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  dayPart: 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM';
  startTime?: string;
  endTime?: string;
  note?: string;
}

/** Dates are stored without a time; this is how they travel to the database. */
const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly publications: PublicationService,
  ) {}

  // ───────────── Planning view ─────────────

  /**
   * Everything the planning screen shows for one site over a period:
   * 7 days from a Monday for the week view, a whole month for the month view.
   */
  async period(user: SessionUser, siteId: string, monday: string, length: number) {
    const site = await this.siteOrThrow(siteId);
    // What this person may do here; the screen hides the rest.
    const rights = {
      editShifts: can(user.grants, 'shift.write', siteId),
      editAbsences: can(user.grants, 'absence.write', siteId),
      lock:
        can(user.grants, 'day.lock', siteId) ||
        can(user.grants, 'day.payrollLock', siteId),
      // The departments this person may publish: kitchen for a head chef,
      // both for a site director.
      publish: DEPARTMENTS.filter((department) =>
        can(user.grants, 'planning.publish', siteId, department),
      ),
    };
    // Publication is per week, so it is only reported for the week view.
    const publication = length === 7 ? await this.publications.ofWeek(siteId, monday) : null;
    // A plain employee sees that a colleague is absent, not why: the reason
    // (an arrêt maladie, for example) is personal.
    const seesAbsenceTypes = can(user.grants, 'shift.read', siteId);
    // Leave requests are for the people who decide them.
    const seesRequests = canDecide(user.grants, { route: 'DIRECTOR', siteId });
    const dates = Array.from({ length }, (_, i) => addDays(monday, i));
    const last = dates[length - 1];
    const from = zonedDateTime(monday, '00:00', site.timezone);
    const to = zonedDateTime(addDays(monday, length), '00:00', site.timezone);

    const [employees, shifts, locks, posts, absenceTypes] = await Promise.all([
      this.prisma.employee.findMany({
        where: { isActive: true, assignments: { some: { siteId } } },
        include: {
          // The contract in force during the week gives the weekly hours.
          contracts: {
            where: {
              startDate: { lte: toDbDate(last) },
              OR: [{ endDate: null }, { endDate: { gte: toDbDate(monday) } }],
            },
            orderBy: { startDate: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.shift.findMany({
        where: { siteId, startsAt: { gte: from, lt: to } },
        include: { post: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.dayLock.findMany({
        where: { siteId, date: { gte: toDbDate(monday), lte: toDbDate(last) } },
      }),
      this.prisma.post.findMany({
        where: { isActive: true },
        orderBy: [{ department: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.absenceType.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const absences = await this.prisma.absence.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        startDate: { lte: toDbDate(last) },
        endDate: { gte: toDbDate(monday) },
      },
      include: { type: true },
    });
    // Requests still waiting for a decision are shown on the planning too.
    const pendingRequests = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        status: 'PENDING',
        startDate: { lte: toDbDate(last) },
        endDate: { gte: toDbDate(monday) },
      },
      include: { type: true },
    });

    // Employees without a role only see the weeks that have been published.
    const { shiftIsPublished } = await this.publications.visibility([siteId]);
    const visibleShifts = seesAbsenceTypes
      ? shifts
      : shifts.filter((shift) => shiftIsPublished({ ...shift, site }));

    const shiftCards = visibleShifts.map((shift) => ({
      id: shift.id,
      employeeId: shift.employeeId,
      date: localDate(shift.startsAt, site.timezone),
      start: localTime(shift.startsAt, site.timezone),
      end: localTime(shift.endsAt, site.timezone),
      service: shift.service,
      postId: shift.postId,
      postName: shift.post.name,
      color: shift.post.color,
      breakMinutes: shift.breakMinutes,
      meals: shift.meals,
      note: shift.note,
      minutes: plannedMinutes(shift.startsAt, shift.endsAt, shift.breakMinutes),
    }));

    const rows = employees.map((employee) => {
      const contract = employee.contracts[0];
      const own = shiftCards.filter((card) => card.employeeId === employee.id);
      const planned = own.reduce((sum, card) => sum + card.minutes, 0);
      const contractMinutes =
        contract?.weeklyHours != null
          ? Math.round(Number(contract.weeklyHours) * 60)
          : null; // forfait jours, or no contract known: no counter
      return {
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
        },
        contractMinutes,
        plannedMinutes: planned,
        // Only shifts count for now; how absences count is an open question.
        // The contract is weekly, so the difference only makes sense for a week.
        differenceMinutes:
          contractMinutes === null || length !== 7
            ? null
            : planned - contractMinutes,
        shifts: own,
        absences: absences
          .filter((absence) => absence.employeeId === employee.id)
          .map((absence) => ({
            id: absence.id,
            employeeId: absence.employeeId,
            absenceTypeId: absence.absenceTypeId,
            typeName: seesAbsenceTypes ? absence.type.name : 'Absent',
            startDate: fromDbDate(absence.startDate),
            endDate: fromDbDate(absence.endDate),
            dayPart: absence.dayPart,
            startTime: absence.startTime,
            endTime: absence.endTime,
            note: absence.note,
          })),
        requests: pendingRequests
          .filter((request) => seesRequests && request.employeeId === employee.id)
          .map((request) => ({
            id: request.id,
            typeName: request.type.name,
            startDate: fromDbDate(request.startDate),
            endDate: fromDbDate(request.endDate),
          })),
      };
    });

    const days = dates.map((date) => {
      const ofDay = shiftCards.filter((card) => card.date === date);
      return {
        date,
        lock: locks.find((lock) => fromDbDate(lock.date) === date)?.status ?? 'OPEN',
        people: new Set(ofDay.map((card) => card.employeeId)).size,
        minutes: ofDay.reduce((sum, card) => sum + card.minutes, 0),
      };
    });

    return {
      site: { id: site.id, name: site.name },
      rights,
      publication,
      days,
      rows,
      totalMinutes: days.reduce((sum, day) => sum + day.minutes, 0),
      posts,
      absenceTypes: absenceTypes.map(({ id, name, category }) => ({ id, name, category })),
    };
  }

  // ───────────── Publication ─────────────

  /** Makes one department of a week visible to the staff, or hides it again. */
  async setPublication(
    user: SessionUser,
    siteId: string,
    monday: string,
    department: Department,
    published: boolean,
  ) {
    await this.siteOrThrow(siteId);
    this.access.assert(user, 'planning.publish', siteId, department);
    await this.publications.set(siteId, monday, department, published, user.id);
    await this.audit.record({
      actorUserId: user.id,
      action: published ? 'planning.publish' : 'planning.unpublish',
      entity: 'Site',
      entityId: siteId,
      data: { week: monday, department },
    });
    return { week: monday, department, published };
  }

  // ───────────── Shifts ─────────────

  async createShift(user: SessionUser, siteId: string, input: ShiftInput) {
    const data = await this.checkShift(user, siteId, input);
    const shift = await this.prisma.shift.create({
      data: { ...data, siteId, createdById: user.id },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'shift.create',
      entity: 'Shift',
      entityId: shift.id,
      data: input,
    });
    return { id: shift.id };
  }

  async updateShift(user: SessionUser, siteId: string, id: string, input: ShiftInput) {
    const before = await this.shiftOrThrow(siteId, id);
    // The day and the post it is moved away from must also be editable.
    this.access.assert(user, 'shift.write', siteId, before.post.department);
    await this.assertDayOpen(siteId, localDate(before.startsAt, before.site.timezone));

    const data = await this.checkShift(user, siteId, input);
    await this.prisma.shift.update({ where: { id }, data });
    await this.audit.record({
      actorUserId: user.id,
      action: 'shift.update',
      entity: 'Shift',
      entityId: id,
      data: input,
    });
    return { id };
  }

  async deleteShift(user: SessionUser, siteId: string, id: string) {
    const shift = await this.shiftOrThrow(siteId, id);
    this.access.assert(user, 'shift.write', siteId, shift.post.department);
    await this.assertDayOpen(siteId, localDate(shift.startsAt, shift.site.timezone));
    await this.prisma.shift.delete({ where: { id } });
    // The deleted shift is kept in the audit log.
    await this.audit.record({
      actorUserId: user.id,
      action: 'shift.delete',
      entity: 'Shift',
      entityId: id,
      data: {
        employeeId: shift.employeeId,
        postId: shift.postId,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
      },
    });
    return { ok: true };
  }

  /** Every rule a shift must pass before it is saved. */
  private async checkShift(user: SessionUser, siteId: string, input: ShiftInput) {
    const site = await this.siteOrThrow(siteId);
    const post = await this.prisma.post.findUnique({ where: { id: input.postId } });
    if (!post) throw new BadRequestException('Poste inconnu');
    // A head chef may only plan kitchen posts; the post decides the department.
    this.access.assert(user, 'shift.write', siteId, post.department);
    await this.assertDayOpen(siteId, input.date);

    const assigned = await this.prisma.siteAssignment.findUnique({
      where: { employeeId_siteId: { employeeId: input.employeeId, siteId } },
    });
    if (!assigned) {
      throw new BadRequestException("Ce salarié n'est pas affecté à ce site");
    }

    // The one thing that blocks planning: an arrêt maladie on that day.
    const blocking = await this.prisma.absence.findFirst({
      where: {
        employeeId: input.employeeId,
        type: { blocksPlanning: true },
        startDate: { lte: toDbDate(input.date) },
        endDate: { gte: toDbDate(input.date) },
      },
      include: { type: true },
    });
    if (blocking) {
      throw new BadRequestException(
        `Impossible de planifier ce salarié : ${blocking.type.name} ce jour-là`,
      );
    }

    const { startsAt, endsAt } = shiftInstants(
      input.date,
      input.start,
      input.end,
      site.timezone,
    );
    return {
      employeeId: input.employeeId,
      postId: input.postId,
      service: input.service,
      startsAt,
      endsAt,
      breakMinutes: input.breakMinutes,
      meals: input.meals,
      note: input.note?.trim() || null,
    };
  }

  // ───────────── Absences ─────────────

  async createAbsence(user: SessionUser, siteId: string, input: AbsenceInput) {
    const data = await this.checkAbsence(user, siteId, input);
    const absence = await this.prisma.absence.create({
      data: { ...data, createdById: user.id },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'absence.create',
      entity: 'Absence',
      entityId: absence.id,
      data: input,
    });
    return { id: absence.id };
  }

  async updateAbsence(user: SessionUser, siteId: string, id: string, input: AbsenceInput) {
    const before = await this.absenceOrThrow(siteId, id);
    await this.assertRangeOpen(siteId, fromDbDate(before.startDate), fromDbDate(before.endDate));
    const data = await this.checkAbsence(user, siteId, input);
    await this.prisma.absence.update({ where: { id }, data });
    await this.audit.record({
      actorUserId: user.id,
      action: 'absence.update',
      entity: 'Absence',
      entityId: id,
      data: input,
    });
    return { id };
  }

  async deleteAbsence(user: SessionUser, siteId: string, id: string) {
    const absence = await this.absenceOrThrow(siteId, id);
    this.access.assert(user, 'absence.write', siteId);
    await this.assertRangeOpen(siteId, fromDbDate(absence.startDate), fromDbDate(absence.endDate));
    await this.prisma.absence.delete({ where: { id } });
    await this.audit.record({
      actorUserId: user.id,
      action: 'absence.delete',
      entity: 'Absence',
      entityId: id,
      data: {
        employeeId: absence.employeeId,
        absenceTypeId: absence.absenceTypeId,
        startDate: absence.startDate,
        endDate: absence.endDate,
      },
    });
    return { ok: true };
  }

  private async checkAbsence(user: SessionUser, siteId: string, input: AbsenceInput) {
    this.access.assert(user, 'absence.write', siteId);
    if (input.endDate < input.startDate) {
      throw new BadRequestException('La date de fin est avant la date de début');
    }
    if (input.dayPart === 'CUSTOM' && (!input.startTime || !input.endTime)) {
      throw new BadRequestException('Indiquez une heure de début et de fin');
    }
    await this.assertRangeOpen(siteId, input.startDate, input.endDate);

    const [assigned, type] = await Promise.all([
      this.prisma.siteAssignment.findUnique({
        where: { employeeId_siteId: { employeeId: input.employeeId, siteId } },
      }),
      this.prisma.absenceType.findUnique({ where: { id: input.absenceTypeId } }),
    ]);
    if (!assigned) {
      throw new BadRequestException("Ce salarié n'est pas affecté à ce site");
    }
    if (!type?.isActive) throw new BadRequestException("Type d'absence inconnu");

    const custom = input.dayPart === 'CUSTOM';
    return {
      employeeId: input.employeeId,
      absenceTypeId: input.absenceTypeId,
      startDate: toDbDate(input.startDate),
      endDate: toDbDate(input.endDate),
      dayPart: input.dayPart,
      startTime: custom ? input.startTime! : null,
      endTime: custom ? input.endTime! : null,
      note: input.note?.trim() || null,
    };
  }

  // ───────────── Day locks ─────────────

  /** Grey (OPEN), blue (LOCKED) or red (PAYROLL). */
  async setDayLock(
    user: SessionUser,
    siteId: string,
    date: string,
    status: DayLockStatus | 'OPEN',
  ) {
    await this.siteOrThrow(siteId);
    const key = { siteId_date: { siteId, date: toDbDate(date) } };
    const current = await this.prisma.dayLock.findUnique({ where: key });

    // Setting or lifting the payslip lock needs the stronger right.
    const touchesPayroll = status === 'PAYROLL' || current?.status === 'PAYROLL';
    this.access.assert(user, touchesPayroll ? 'day.payrollLock' : 'day.lock', siteId);

    if (status === 'OPEN') {
      if (current) await this.prisma.dayLock.delete({ where: key });
    } else {
      await this.prisma.dayLock.upsert({
        where: key,
        update: { status, setById: user.id, setAt: new Date() },
        create: { siteId, date: toDbDate(date), status, setById: user.id },
      });
    }
    await this.audit.record({
      actorUserId: user.id,
      action: 'day.lock',
      entity: 'Site',
      entityId: siteId,
      data: { date, from: current?.status ?? 'OPEN', to: status },
    });
    return { date, lock: status };
  }

  private async assertDayOpen(siteId: string, date: string) {
    await this.assertRangeOpen(siteId, date, date);
  }

  /** Refuses the change when one of the days is locked (blue or red). */
  async assertRangeOpen(siteId: string, startDate: string, endDate: string) {
    const lock = await this.prisma.dayLock.findFirst({
      where: { siteId, date: { gte: toDbDate(startDate), lte: toDbDate(endDate) } },
    });
    if (lock) {
      const [year, month, day] = fromDbDate(lock.date).split('-');
      throw new ConflictException(`Le ${day}/${month}/${year} est verrouillé`);
    }
  }

  // ───────────── Lookups ─────────────

  private async siteOrThrow(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException();
    return site;
  }

  private async shiftOrThrow(siteId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, siteId },
      include: { post: true, site: true },
    });
    if (!shift) throw new NotFoundException();
    return shift;
  }

  /** An absence is reachable from a site when its employee works there. */
  private async absenceOrThrow(siteId: string, id: string) {
    const absence = await this.prisma.absence.findFirst({
      where: { id, employee: { assignments: { some: { siteId } } } },
    });
    if (!absence) throw new NotFoundException();
    return absence;
  }
}
