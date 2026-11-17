import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type ClockKind,
  type ClockPair,
  computeEntry,
  localDate,
  matchShift,
  nextActions,
  pairClockEvents,
  type PlannedShift,
  STALE_OPEN_PAIR_HOURS,
  addDays,
  localTime,
  plannedMinutes,
  shiftInstants,
  zonedDateTime,
} from '@skellobis/labor-rules';
import type { SessionUser } from '../access/session.js';
import { verifySecret } from '../auth/password.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import type { CurrentDeviceInfo } from '../devices/device.guard.js';
import { PlanningService } from '../planning/planning.service.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "Démo-Test" and "demotest" must match: accents, case and symbols are ignored. */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Clocked in, not out yet, and recently enough to still be at work. */
function stillWorking(pair: ClockPair, now: Date): boolean {
  return (
    pair.clockOut === null &&
    now.getTime() - pair.clockIn.getTime() < STALE_OPEN_PAIR_HOURS * HOUR
  );
}

/** Someone still at work has no end and no total yet, and nothing to flag. */
function inProgress(pair: ClockPair, shift: PlannedShift | null) {
  const computed = computeEntry(pair, shift);
  return {
    ...computed,
    countedEnd: null,
    workedMinutes: null,
    flags: computed.flags.filter((flag) => flag !== 'MISSING_CLOCK_OUT'),
    inProgress: true,
  };
}

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** What the manager sends to validate, correct or add hours. */
export interface ValidateInput {
  employeeId: string;
  clockInAt?: Date; // absent when hours are added by hand
  shiftId?: string;
  date: string; // YYYY-MM-DD at the site
  start: string; // HH:MM
  end: string;
  breakMinutes: number;
  meals: number;
  corrected: boolean;
  reason?: string;
}

export interface ClockInput {
  eventId: string;
  employeeId: string;
  pin: string;
  kind: ClockKind;
  occurredAt: Date;
}

@Injectable()
export class TimeclockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planning: PlanningService,
  ) {}

  // ───────────── Tablet ─────────────

  /** Employees of the site whose last name starts with the typed letters. */
  async roster(siteId: string, prefix: string) {
    const today = new Date();
    const employees = await this.prisma.employee.findMany({
      where: {
        isActive: true,
        assignments: { some: { siteId } },
        // Forfait jours staff are outside the time clock.
        contracts: {
          none: {
            forfaitJours: true,
            OR: [{ endDate: null }, { endDate: { gte: today } }],
          },
        },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const wanted = normalise(prefix);
    return employees.filter((employee) =>
      normalise(employee.lastName).startsWith(wanted),
    );
  }

  /** Checks the PIN and says what the employee can do now. */
  async identify(device: CurrentDeviceInfo, employeeId: string, pin: string) {
    const employee = await this.checkPin(device.siteId, employeeId, pin);
    return {
      employee,
      nextActions: await this.nextActionsFor(employeeId, device.siteId),
    };
  }

  /**
   * Stores one clocking. The tablet generates the event id, so sending the
   * same event twice (bad network, later the offline queue) stores it once.
   */
  async clock(device: CurrentDeviceInfo, input: ClockInput) {
    await this.checkPin(device.siteId, input.employeeId, input.pin);

    const existing = await this.prisma.clockEvent.findUnique({
      where: { id: input.eventId },
    });
    if (existing && existing.employeeId !== input.employeeId) {
      throw new ConflictException('Event id already used');
    }
    const event =
      existing ??
      (await this.prisma.clockEvent.create({
        data: {
          id: input.eventId,
          employeeId: input.employeeId,
          siteId: device.siteId,
          deviceId: device.id,
          kind: input.kind,
          occurredAt: input.occurredAt,
        },
      }));

    return {
      event: { id: event.id, kind: event.kind, occurredAt: event.occurredAt },
      nextActions: await this.nextActionsFor(input.employeeId, device.siteId),
    };
  }

  private async checkPin(siteId: string, employeeId: string, pin: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, isActive: true, assignments: { some: { siteId } } },
    });
    // One message for every failure, so nothing can be guessed from it.
    const ok =
      employee?.pinHash && (await verifySecret(employee.pinHash, pin));
    if (!employee || !ok) throw new UnauthorizedException('Code PIN incorrect');
    return {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
    };
  }

  private async nextActionsFor(employeeId: string, siteId: string) {
    const now = new Date();
    const events = await this.prisma.clockEvent.findMany({
      where: {
        employeeId,
        siteId,
        occurredAt: { gte: new Date(now.getTime() - 36 * HOUR) },
      },
      orderBy: { occurredAt: 'asc' },
    });
    return nextActions(
      events.map((event) => ({ kind: event.kind, at: event.occurredAt })),
      now,
    );
  }

  // ───────────── Manager: planned against clocked ─────────────

  /**
   * The Badgeuse for one day at a site. One row per planned shift, plus one
   * per clocking that matches no shift. Each row carries what was planned,
   * what was clocked, the hours the company rules compute from both, and what
   * the manager has validated. Only validations are stored; the rest is
   * worked out from the shifts and the raw clock events each time.
   */
  async hours(siteId: string, date: string) {
    const site = await this.siteOrThrow(siteId);
    const zone = site.timezone;
    const from = zonedDateTime(date, '00:00', zone);
    const to = zonedDateTime(addDays(date, 1), '00:00', zone);

    // One day of margin on each side, so a shift or clocking that crosses
    // midnight is still paired correctly.
    const window = {
      gte: new Date(from.getTime() - DAY),
      lt: new Date(to.getTime() + DAY),
    };
    const [events, shifts, validations, lastEvent] = await Promise.all([
      this.prisma.clockEvent.findMany({
        where: { siteId, occurredAt: window },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.shift.findMany({
        where: { siteId, startsAt: window },
        include: { post: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.timeEntry.findMany({ where: { siteId, date: toDbDate(date) } }),
      this.prisma.clockEvent.findFirst({
        where: { siteId },
        orderBy: { receivedAt: 'desc' },
      }),
    ]);

    const employeeIds = [
      ...new Set([...events, ...shifts].map((row) => row.employeeId)),
    ];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true },
    });

    const clock = (at: Date | null) => (at ? localTime(at, zone) : null);
    const inDay = (at: Date) => at >= from && at < to;
    const now = new Date();
    const rows = [];

    for (const employee of employees) {
      const ownShifts = shifts.filter((s) => s.employeeId === employee.id);

      // Coupure: several shifts starting on the same day at the site. Every
      // one but the last of the day is followed by the break.
      const lastOfDay = new Map<string, string>();
      for (const shift of ownShifts) {
        lastOfDay.set(localDate(shift.startsAt, zone), shift.id); // sorted by start
      }
      const endsBeforeBreak = (shift: { id: string; startsAt: Date }) =>
        lastOfDay.get(localDate(shift.startsAt, zone)) !== shift.id;
      let available: PlannedShift[] = ownShifts.map((shift) => ({
        id: shift.id,
        start: shift.startsAt,
        end: shift.endsAt,
        breakMinutes: shift.breakMinutes,
        endsBeforeBreak: endsBeforeBreak(shift),
      }));

      const { pairs } = pairClockEvents(
        events
          .filter((event) => event.employeeId === employee.id)
          .map((event) => ({ kind: event.kind, at: event.occurredAt })),
      );

      // Which clocking goes with which shift.
      const clockedFor = new Map<string, ClockPair>();
      const unplanned: ClockPair[] = [];
      for (const pair of pairs) {
        const planned = matchShift(pair, available);
        if (planned) {
          available = available.filter((s) => s.id !== planned.id);
          clockedFor.set(planned.id, pair);
        } else if (inDay(pair.clockIn)) {
          unplanned.push(pair);
        }
      }

      const row = (
        shift: (typeof ownShifts)[number] | null,
        pair: ClockPair | null,
      ) => {
        const planned =
          shift && {
            id: shift.id,
            start: shift.startsAt,
            end: shift.endsAt,
            breakMinutes: shift.breakMinutes,
            endsBeforeBreak: endsBeforeBreak(shift),
          };
        const working = pair !== null && stillWorking(pair, now);
        const computed = pair
          ? working
            ? inProgress(pair, planned)
            : computeEntry(pair, planned)
          : null;
        const validation = validations.find(
          (entry) =>
            entry.employeeId === employee.id &&
            (pair
              ? entry.clockInAt?.getTime() === pair.clockIn.getTime()
              : shift !== null && entry.clockInAt === null && entry.shiftId === shift.id),
        );
        return {
          // Stable identity of the row for the screen.
          key: `${employee.id}:${shift?.id ?? pair!.clockIn.toISOString()}`,
          sortAt: (shift?.startsAt ?? pair!.clockIn).getTime(),
          employee,
          date,
          shift: shift && {
            id: shift.id,
            post: shift.post.name,
            service: shift.service,
            start: clock(shift.startsAt),
            end: clock(shift.endsAt),
            breakMinutes: shift.breakMinutes,
            meals: shift.meals,
          },
          clocked: pair && {
            clockInAt: pair.clockIn,
            start: clock(pair.clockIn),
            end: clock(pair.clockOut),
            breakMinutes: pair.clockedBreakMinutes,
          },
          // What the rules give; null while nothing was clocked.
          computed: computed && {
            start: clock(computed.countedStart),
            end: clock(computed.countedEnd),
            breakMinutes: computed.breakMinutes,
            workedMinutes: computed.workedMinutes,
            flags: computed.flags,
          },
          inProgress: working,
          validation: validation
            ? {
                id: validation.id,
                start: localTime(validation.startsAt, zone),
                end: localTime(validation.endsAt, zone),
                breakMinutes: validation.breakMinutes,
                workedMinutes: validation.workedMinutes,
                meals: validation.meals,
                corrected: validation.corrected,
                reason: validation.reason,
              }
            : null,
        };
      };

      for (const shift of ownShifts) {
        if (inDay(shift.startsAt)) rows.push(row(shift, clockedFor.get(shift.id) ?? null));
      }
      for (const pair of unplanned) rows.push(row(null, pair));
    }
    rows.sort((a, b) => a.sortAt - b.sortAt);

    // Absences planned on that day, for the people of this site.
    const absences = await this.prisma.absence.findMany({
      where: {
        startDate: { lte: toDbDate(date) },
        endDate: { gte: toDbDate(date) },
        employee: { isActive: true, assignments: { some: { siteId } } },
      },
      include: {
        type: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    return {
      date,
      rows,
      absences: absences.map((absence) => ({
        id: absence.id,
        employee: absence.employee,
        typeName: absence.type.name,
        dayPart: absence.dayPart,
        startTime: absence.startTime,
        endTime: absence.endTime,
      })),
      // When the tablet last sent a clocking.
      lastSyncAt: lastEvent?.receivedAt ?? null,
    };
  }

  /** For the week's list of days: how many rows each day has, and how many are validated. */
  async week(siteId: string, monday: string) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const { rows } = await this.hours(siteId, date);
      days.push({
        date,
        rows: rows.length,
        validated: rows.filter((row) => row.validation).length,
      });
    }
    return days;
  }

  /**
   * Validates one row of the Badgeuse: the hours and meals that will be paid.
   * `corrected` says the manager changed what the rules computed; a note can
   * explain why. Without `clockInAt` the row is a planned shift that was not
   * clocked.
   */
  async validate(user: SessionUser, siteId: string, input: ValidateInput) {
    const site = await this.siteOrThrow(siteId);
    await this.planning.assertRangeOpen(siteId, input.date, input.date);

    const assigned = await this.prisma.siteAssignment.findUnique({
      where: { employeeId_siteId: { employeeId: input.employeeId, siteId } },
    });
    if (!assigned) {
      throw new BadRequestException("Ce salarié n'est pas affecté à ce site");
    }
    if (input.clockInAt) {
      const clockIn = await this.prisma.clockEvent.findFirst({
        where: {
          siteId,
          employeeId: input.employeeId,
          kind: 'IN',
          occurredAt: input.clockInAt,
        },
      });
      if (!clockIn) throw new BadRequestException('Badgeage introuvable');
    }

    const { startsAt, endsAt } = shiftInstants(
      input.date,
      input.start,
      input.end,
      site.timezone,
    );
    const data = {
      siteId,
      employeeId: input.employeeId,
      shiftId: input.shiftId ?? null,
      clockInAt: input.clockInAt ?? null,
      date: toDbDate(input.date),
      startsAt,
      endsAt,
      breakMinutes: input.breakMinutes,
      workedMinutes: plannedMinutes(startsAt, endsAt, input.breakMinutes),
      meals: input.meals,
      corrected: input.corrected || !input.clockInAt,
      reason: input.reason?.trim() || null,
      validatedById: user.id,
      validatedAt: new Date(),
    };

    const before = input.clockInAt
      ? await this.prisma.timeEntry.findUnique({
          where: {
            employeeId_clockInAt: {
              employeeId: input.employeeId,
              clockInAt: input.clockInAt,
            },
          },
        })
      : input.shiftId
        ? // A shift validated without a clocking is found by the shift.
          await this.prisma.timeEntry.findFirst({
            where: {
              siteId,
              employeeId: input.employeeId,
              clockInAt: null,
              shiftId: input.shiftId,
            },
          })
        : null;
    const entry = before
      ? await this.prisma.timeEntry.update({ where: { id: before.id }, data })
      : await this.prisma.timeEntry.create({ data });

    // Who changed what, from what to what, and why.
    await this.audit.record({
      actorUserId: user.id,
      action: before ? 'timeEntry.update' : 'timeEntry.validate',
      entity: 'TimeEntry',
      entityId: entry.id,
      data: {
        before: before && {
          startsAt: before.startsAt,
          endsAt: before.endsAt,
          breakMinutes: before.breakMinutes,
          reason: before.reason,
        },
        after: {
          startsAt,
          endsAt,
          breakMinutes: input.breakMinutes,
          meals: input.meals,
          corrected: data.corrected,
          reason: data.reason,
        },
      },
    });
    return { id: entry.id };
  }

  /** Removes a validation; the clocking goes back to "to validate". */
  async unvalidate(user: SessionUser, siteId: string, id: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, siteId } });
    if (!entry) throw new NotFoundException();
    const date = entry.date.toISOString().slice(0, 10);
    await this.planning.assertRangeOpen(siteId, date, date);
    await this.prisma.timeEntry.delete({ where: { id } });
    await this.audit.record({
      actorUserId: user.id,
      action: 'timeEntry.unvalidate',
      entity: 'TimeEntry',
      entityId: id,
      data: {
        employeeId: entry.employeeId,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        breakMinutes: entry.breakMinutes,
        corrected: entry.corrected,
        reason: entry.reason,
      },
    });
    return { ok: true };
  }

  private async siteOrThrow(siteId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException();
    return site;
  }
}
