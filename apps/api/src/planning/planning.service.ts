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
  mondayOf,
  absenceDayMinutes,
  countedAbsenceMinutes,
  plannedMinutes,
  planningAlerts,
  shiftDefaults,
  shiftInstants,
  zonedDateTime,
} from '@skellobis/labor-rules';
import { AccessService } from '../access/access.service.js';
import { can } from '../access/permissions.js';
import { canSee } from '../leave/leave.rules.js';
import type { SessionUser } from '../access/session.js';
import { AuditService } from '../core/audit.service.js';
import { frenchDate, NotifyService } from '../core/notify.service.js';
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
  /** Absent: the company default for that start time. */
  breakMinutes?: number;
  meals?: number;
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
const DAY = 86_400_000;
const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * What to show under a name when there is no weekly counter: forfait jours,
 * the contract type (an extra has no fixed hours), or null without a contract.
 */
function contractKind(
  contract: { type: string; forfaitJours: boolean } | undefined,
): string | null {
  if (!contract) return null;
  return contract.forfaitJours ? 'FORFAIT_JOURS' : contract.type;
}

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly publications: PublicationService,
    private readonly notify: NotifyService,
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
      needs: can(user.grants, 'needs.write', siteId),
      publish: DEPARTMENTS.filter((department) =>
        can(user.grants, 'planning.publish', siteId, department),
      ),
    };
    // Publication is per week, so it is only reported for the week view.
    const publication = length === 7 ? await this.publications.ofWeek(siteId, monday) : null;
    // A plain employee sees that a colleague is absent, not why: the reason
    // (an arrêt maladie, for example) is personal.
    const seesAbsenceTypes = can(user.grants, 'shift.read', siteId);
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
          assignments: { where: { siteId }, select: { planningOrder: true } },
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

    // Alerts are per week and for the people who plan. They look at the
    // person's whole week, in every restaurant, plus the day before for the
    // rest before Monday.
    const withAlerts = length === 7 && seesAbsenceTypes;
    const everywhere = withAlerts
      ? await this.prisma.shift.findMany({
          where: {
            employeeId: { in: employees.map((employee) => employee.id) },
            startsAt: { gte: new Date(from.getTime() - DAY), lt: to },
          },
          include: { site: true },
        })
      : [];

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

    /** Hours that this person's counting absences add over the period. */
    const counted = (own: typeof absences, contractMinutes: number | null) =>
      countedAbsenceMinutes(
        dates,
        own
          .filter((absence) => absence.type.countsInCounter)
          .map((absence) => ({
            startDate: fromDbDate(absence.startDate),
            endDate: fromDbDate(absence.endDate),
            dayMinutes: absenceDayMinutes(
              contractMinutes,
              absence.dayPart,
              absence.startTime,
              absence.endTime,
            ),
          })),
      );

    // The site's own order first (rows keep their place from week to week),
    // then everyone else, alphabetically as fetched.
    const place = (employee: (typeof employees)[number]) =>
      employee.assignments[0]?.planningOrder ?? Number.MAX_SAFE_INTEGER;
    employees.sort((a, b) => place(a) - place(b));

    const rows = employees.map((employee) => {
      const contract = employee.contracts[0];
      const own = shiftCards.filter((card) => card.employeeId === employee.id);
      const planned = own.reduce((sum, card) => sum + card.minutes, 0);
      const ownAbsences = absences.filter((absence) => absence.employeeId === employee.id);
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
        contractKind: contractKind(contract),
        plannedMinutes: planned,
        // Paid leave counts as hours: a day is worth a fifth of the contract.
        absenceMinutes: counted(ownAbsences, contractMinutes),
        // The contract is weekly, so the difference only makes sense for a week.
        differenceMinutes:
          contractMinutes === null || length !== 7
            ? null
            : planned + counted(ownAbsences, contractMinutes) - contractMinutes,
        shifts: own,
        absences: ownAbsences.map((absence) => ({
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
            // What one day of it is worth: a fifth of the weekly contract.
            dayMinutes: absenceDayMinutes(
              contractMinutes,
              absence.dayPart,
              absence.startTime,
              absence.endTime,
            ),
          })),
        alerts: withAlerts
          ? planningAlerts(
              monday,
              everywhere
                .filter((shift) => shift.employeeId === employee.id)
                .map((shift) => ({
                  date: localDate(shift.startsAt, shift.site.timezone),
                  startsAt: shift.startsAt,
                  endsAt: shift.endsAt,
                  minutes: plannedMinutes(shift.startsAt, shift.endsAt, shift.breakMinutes),
                })),
              absences
                .filter((absence) => absence.employeeId === employee.id)
                .map((absence) => ({
                  startDate: fromDbDate(absence.startDate),
                  endDate: fromDbDate(absence.endDate),
                  typeName: absence.type.name,
                })),
            )
          : [],
        requests: pendingRequests
          // Only for the people allowed to see that request.
          .filter(
            (request) =>
              request.employeeId === employee.id &&
              canSee(user.grants, { route: request.route, siteId }),
          )
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

    // Posts the restaurant's general rule asks for and the planning lacks,
    // day by day. For the people who plan, on the week view.
    const missing = withAlerts ? await this.missingPosts(siteId, dates, shiftCards) : [];

    return {
      site: { id: site.id, name: site.name },
      rights,
      missing,
      publication,
      days,
      rows,
      totalMinutes: days.reduce((sum, day) => sum + day.minutes, 0),
      posts,
      absenceTypes: absenceTypes.map(({ id, name, category }) => ({ id, name, category })),
    };
  }

  // ───────────── Staffing needs ─────────────

  needs(siteId: string) {
    return this.prisma.staffingNeed.findMany({
      where: { siteId },
      select: { weekday: true, service: true, postId: true, department: true, count: true },
    });
  }

  /** Replaces the restaurant's whole rule with the grid sent by the screen. */
  async setNeeds(
    user: SessionUser,
    siteId: string,
    needs: {
      weekday: number;
      service: 'AM' | 'PM';
      postId: string | null;
      department: Department | null;
      count: number;
    }[],
  ) {
    await this.siteOrThrow(siteId);
    this.access.assert(user, 'needs.write', siteId);
    // A line is about one post, or about one department as a whole.
    const lines = needs.filter(
      (need) => need.count > 0 && (need.postId === null) !== (need.department === null),
    );
    await this.prisma.$transaction([
      this.prisma.staffingNeed.deleteMany({ where: { siteId } }),
      this.prisma.staffingNeed.createMany({
        data: lines.map((need) => ({ ...need, siteId })),
      }),
    ]);
    await this.audit.record({
      actorUserId: user.id,
      action: 'needs.set',
      entity: 'Site',
      entityId: siteId,
      data: { lines: lines.length },
    });
    return { lines: lines.length };
  }

  /** Compares the rule with what is planned on each day of the period. */
  private async missingPosts(
    siteId: string,
    dates: string[],
    cards: { date: string; service: 'AM' | 'PM'; postId: string; employeeId: string }[],
  ) {
    const needs = await this.prisma.staffingNeed.findMany({
      where: { siteId },
      include: { post: true },
    });
    if (needs.length === 0) return [];
    const posts = await this.prisma.post.findMany({ select: { id: true, department: true } });
    const departmentOf = new Map(posts.map((post) => [post.id, post.department]));

    const missing = [];
    for (const date of dates) {
      const weekday = (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7; // Monday = 0
      for (const need of needs.filter((n) => n.weekday === weekday)) {
        const people = new Set(
          cards
            .filter(
              (card) =>
                card.date === date &&
                card.service === need.service &&
                (need.postId
                  ? card.postId === need.postId
                  : departmentOf.get(card.postId) === need.department),
            )
            .map((card) => card.employeeId),
        );
        if (people.size < need.count) {
          missing.push({
            date,
            service: need.service,
            // A post by its name; a department as a total.
            label: need.post?.name ?? (need.department === 'KITCHEN' ? 'Cuisine (total)' : 'Salle (total)'),
            postId: need.postId, // null for a department total
            department: need.post?.department ?? need.department!,
            needed: need.count,
            planned: people.size,
          });
        }
      }
    }
    return missing;
  }

  // ───────────── Filling a gap ─────────────

  /**
   * Who could take a missing post, best choice first.
   *
   * Someone qualifies when they work at the site, hold the post, are free on
   * that service (no shift in it, no overlapping hours, no absence that day).
   * They are ranked: those the shift would cause no new alert for, then by
   * hours left on their contract this week.
   *
   * The hours proposed are the restaurant's most usual ones for that post and
   * service. Nothing is created here: the planner picks, then a normal shift
   * is added.
   */
  async suggestions(
    user: SessionUser,
    siteId: string,
    date: string,
    service: 'AM' | 'PM',
    postId: string,
  ) {
    const site = await this.siteOrThrow(siteId);
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new BadRequestException('Poste inconnu');
    this.access.assert(user, 'shift.write', siteId, post.department);

    // The usual hours: this post and service first, else this service.
    const popular = await this.popularShifts(siteId);
    const ofPost = popular.find((p) => p.postId === postId && p.service === service);
    const usual = ofPost ?? popular.find((p) => p.service === service);
    const start = usual?.start ?? (service === 'AM' ? '10:00' : '18:00');
    const end = usual?.end ?? (service === 'AM' ? '15:00' : '23:00');
    const template = {
      start,
      end,
      breakMinutes: usual?.breakMinutes ?? shiftDefaults(start).breakMinutes,
      meals: usual?.meals ?? shiftDefaults(start).meals,
      // Where the hours come from, so the screen can say so honestly.
      source: ofPost ? 'post' : usual ? 'service' : 'default',
    };
    const { startsAt, endsAt } = shiftInstants(date, start, end, site.timezone);
    const minutes = plannedMinutes(startsAt, endsAt, template.breakMinutes);

    const monday = mondayOf(date);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const weekStart = zonedDateTime(monday, '00:00', site.timezone);
    const weekEnd = zonedDateTime(addDays(monday, 7), '00:00', site.timezone);

    const holders = await this.prisma.employee.findMany({
      where: {
        isActive: true,
        assignments: { some: { siteId } },
        posts: { some: { postId } },
      },
      include: {
        contracts: {
          where: {
            startDate: { lte: toDbDate(dates[6]) },
            OR: [{ endDate: null }, { endDate: { gte: toDbDate(monday) } }],
          },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
        // Their whole week, in every restaurant, plus the day before.
        shifts: {
          where: { startsAt: { gte: new Date(weekStart.getTime() - DAY), lt: weekEnd } },
          include: { site: true },
        },
        absences: {
          where: { startDate: { lte: toDbDate(dates[6]) }, endDate: { gte: toDbDate(monday) } },
          include: { type: true },
        },
      },
    });

    const candidates = [];
    for (const person of holders) {
      const week = person.shifts.map((shift) => ({
        date: localDate(shift.startsAt, shift.site.timezone),
        service: shift.service,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        minutes: plannedMinutes(shift.startsAt, shift.endsAt, shift.breakMinutes),
      }));
      const absences = person.absences.map((absence) => ({
        startDate: fromDbDate(absence.startDate),
        endDate: fromDbDate(absence.endDate),
        typeName: absence.type.name,
        counts: absence.type.countsInCounter,
        dayPart: absence.dayPart,
        startTime: absence.startTime,
        endTime: absence.endTime,
      }));

      // Not free: already on that service, busy during those hours, or absent.
      const busy = week.some(
        (shift) =>
          (shift.date === date && shift.service === service) ||
          (shift.startsAt < endsAt && shift.endsAt > startsAt),
      );
      const absent = absences.some((a) => a.startDate <= date && date <= a.endDate);
      if (busy || absent) continue;

      const contract = person.contracts[0];
      const contractMinutes =
        contract?.weeklyHours != null ? Math.round(Number(contract.weeklyHours) * 60) : null;
      const ofWeek = week.filter((shift) => dates.includes(shift.date));
      const planned =
        ofWeek.reduce((sum, shift) => sum + shift.minutes, 0) +
        countedAbsenceMinutes(
          dates,
          absences
            .filter((a) => a.counts)
            .map((a) => ({
              startDate: a.startDate,
              endDate: a.endDate,
              dayMinutes: absenceDayMinutes(contractMinutes, a.dayPart, a.startTime, a.endTime),
            })),
        );

      // The alerts this shift would add to the person's week.
      const describe = (alert: { kind: string; date?: string }) => `${alert.kind}:${alert.date ?? ''}`;
      const before = new Set(planningAlerts(monday, week, absences).map(describe));
      const after = planningAlerts(
        monday,
        [...week, { date, service, startsAt, endsAt, minutes }],
        absences,
      );
      const newAlerts = after.filter((alert) => !before.has(describe(alert)));

      candidates.push({
        employee: { id: person.id, firstName: person.firstName, lastName: person.lastName },
        contractMinutes,
        contractKind: contractKind(contract),
        plannedMinutes: planned,
        // Hours still to plan this week, before this shift.
        remainingMinutes: contractMinutes === null ? null : contractMinutes - planned,
        newAlerts,
      });
    }

    candidates.sort(
      (a, b) =>
        a.newAlerts.length - b.newAlerts.length ||
        (b.remainingMinutes ?? -Infinity) - (a.remainingMinutes ?? -Infinity),
    );
    return {
      post: { id: post.id, name: post.name, color: post.color },
      template,
      minutes,
      candidates: candidates.slice(0, 10),
    };
  }

  // ───────────── Popular shifts ─────────────

  /**
   * The shifts this restaurant plans most often over the last two months,
   * offered as one-click templates when adding a shift.
   */
  async popularShifts(siteId: string) {
    const site = await this.siteOrThrow(siteId);
    const recent = await this.prisma.shift.findMany({
      where: { siteId, startsAt: { gte: new Date(Date.now() - 60 * DAY) } },
      include: { post: true },
    });
    const groups = new Map<
      string,
      {
        postId: string;
        postName: string;
        color: string;
        service: 'AM' | 'PM';
        start: string;
        end: string;
        breakMinutes: number;
        meals: number;
        uses: number;
      }
    >();
    for (const shift of recent) {
      if (!shift.post.isActive) continue;
      const start = localTime(shift.startsAt, site.timezone);
      const end = localTime(shift.endsAt, site.timezone);
      const key = [shift.postId, shift.service, start, end, shift.breakMinutes, shift.meals].join('|');
      const group = groups.get(key);
      if (group) group.uses++;
      else {
        groups.set(key, {
          postId: shift.postId,
          postName: shift.post.name,
          color: shift.post.color,
          service: shift.service,
          start,
          end,
          breakMinutes: shift.breakMinutes,
          meals: shift.meals,
          uses: 1,
        });
      }
    }
    // Used at least twice, most used first.
    return [...groups.values()]
      .filter((group) => group.uses >= 2)
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 12);
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
    if (published) await this.announcePublication(user, siteId, monday, department);
    return { week: monday, department, published };
  }

  /** Tells the people planned that week, in that department, that they can look. */
  private async announcePublication(
    user: SessionUser,
    siteId: string,
    monday: string,
    department: Department,
  ) {
    const site = await this.siteOrThrow(siteId);
    const planned = await this.prisma.shift.findMany({
      where: {
        siteId,
        post: { department },
        startsAt: {
          gte: zonedDateTime(monday, '00:00', site.timezone),
          lt: zonedDateTime(addDays(monday, 7), '00:00', site.timezone),
        },
      },
      select: { employeeId: true },
    });
    await this.notify.employees(
      planned.map((shift) => shift.employeeId),
      {
        title: 'Planning publié',
        body: `${site.name} · semaine du ${frenchDate(monday)}`,
        link: `/moi?semaine=${monday}`,
      },
      user.id,
    );
  }

  /**
   * Tells an employee that a shift of theirs changed, when the week is
   * already published (before that they cannot see it anyway).
   */
  private async announceShiftChange(
    user: SessionUser,
    shift: { employeeId: string; siteId: string; startsAt: Date; postId: string },
    what: 'ajouté' | 'modifié' | 'supprimé',
  ) {
    const [site, post] = await Promise.all([
      this.siteOrThrow(shift.siteId),
      this.prisma.post.findUniqueOrThrow({ where: { id: shift.postId } }),
    ]);
    const { shiftIsPublished } = await this.publications.visibility([shift.siteId]);
    if (!shiftIsPublished({ ...shift, site, post })) return;
    const day = localDate(shift.startsAt, site.timezone);
    await this.notify.employees(
      [shift.employeeId],
      {
        title: `Shift ${what}`,
        body: `${site.name} · ${frenchDate(day)}`,
        link: `/moi?semaine=${mondayOf(day)}`,
      },
      user.id,
    );
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
    await this.announceShiftChange(user, shift, 'ajouté');
    return { id: shift.id };
  }

  async updateShift(user: SessionUser, siteId: string, id: string, input: ShiftInput) {
    const before = await this.shiftOrThrow(siteId, id);
    // The day and the post it is moved away from must also be editable.
    this.access.assert(user, 'shift.write', siteId, before.post.department);
    await this.assertDayOpen(siteId, localDate(before.startsAt, before.site.timezone));

    const data = await this.checkShift(user, siteId, input, id);
    const after = await this.prisma.shift.update({ where: { id }, data });
    await this.audit.record({
      actorUserId: user.id,
      action: 'shift.update',
      entity: 'Shift',
      entityId: id,
      data: input,
    });
    await this.announceShiftChange(user, after, 'modifié');
    // Moved to someone else: the first person loses the shift.
    if (before.employeeId !== after.employeeId) {
      await this.announceShiftChange(user, before, 'supprimé');
    }
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
    await this.announceShiftChange(user, shift, 'supprimé');
    return { ok: true };
  }

  /** Every rule a shift must pass before it is saved. */
  private async checkShift(
    user: SessionUser,
    siteId: string,
    input: ShiftInput,
    excludeShiftId?: string, // the shift being edited, which may overlap itself
  ) {
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

    // One person cannot be in two places, nor hold two posts in the same
    // service. This is checked across every restaurant they work
    // at, for a shift added by hand, edited, or duplicated by dragging.
    const sameDays = await this.prisma.shift.findMany({
      where: {
        employeeId: input.employeeId,
        id: excludeShiftId ? { not: excludeShiftId } : undefined,
        startsAt: { lt: new Date(endsAt.getTime() + DAY) },
        endsAt: { gt: new Date(startsAt.getTime() - DAY) },
      },
      include: { employee: true, site: true, post: true },
    });
    for (const other of sameDays) {
      const elsewhere = other.siteId === siteId ? '' : ` à ${other.site.name}`;
      if (other.startsAt < endsAt && other.endsAt > startsAt) {
        throw new ConflictException(
          `${other.employee.firstName} a déjà un shift sur ce créneau${elsewhere}`,
        );
      }
      // One position per person per service: someone already on a post for
      // the AM (or PM) service that day cannot be given another one.
      if (
        other.service === input.service &&
        localDate(other.startsAt, other.site.timezone) === input.date
      ) {
        throw new ConflictException(
          `${other.employee.firstName} a déjà un poste sur le service ${other.service} ce jour-là : ${other.post.name}${elsewhere}`,
        );
      }
    }
    return {
      employeeId: input.employeeId,
      postId: input.postId,
      service: input.service,
      startsAt,
      endsAt,
      breakMinutes: input.breakMinutes ?? shiftDefaults(input.start).breakMinutes,
      meals: input.meals ?? shiftDefaults(input.start).meals,
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
