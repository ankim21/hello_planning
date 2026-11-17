import { BadRequestException, Injectable } from '@nestjs/common';
import {
  addDays,
  localDate,
  localTime,
  plannedMinutes,
  zonedDateTime,
} from '@skellobis/labor-rules';
import { AccessService } from '../access/access.service.js';
import type { SessionUser } from '../access/session.js';
import { PrismaService } from '../core/prisma.service.js';
import { PublicationService } from '../planning/publication.service.js';

const DAY = 86_400_000;
const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

/** Week boundaries are taken in French time; every site is in France. */
const ZONE = 'Europe/Paris';

const person = (employee: { id: string; firstName: string; lastName: string }) => ({
  id: employee.id,
  firstName: employee.firstName,
  lastName: employee.lastName,
});

/**
 * "Mon espace": what one employee sees about their own work. Everything here
 * is read from the same shifts and absences as the manager screens; nothing
 * is stored separately. Only published weeks are shown, also to a manager
 * looking at their own space: it is what the staff see.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly publications: PublicationService,
  ) {}

  /** Who I am, where I work, which posts I hold. */
  async overview(user: SessionUser) {
    const base = {
      email: user.email,
      grants: user.grants,
      // People with a role also have the management screens.
      hasManagement: user.grants.length > 0,
    };
    if (!user.employeeId) return { ...base, employee: null };

    const now = new Date();
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
      include: {
        // The main restaurant first, then by name.
        assignments: {
          include: { site: true },
          orderBy: [{ isPrimary: 'desc' }, { site: { name: 'asc' } }],
        },
        posts: { include: { post: true } },
        contracts: {
          where: { OR: [{ endDate: null }, { endDate: { gte: now } }] },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
      },
    });
    const contract = employee.contracts[0];

    // The next shift at each restaurant, for the profile's restaurant cards.
    const { shiftIsPublished } = await this.publications.visibility(
      employee.assignments.map(({ site }) => site.id),
    );
    const sites = [];
    for (const { site, isPrimary } of employee.assignments) {
      const upcoming = await this.prisma.shift.findMany({
        where: { employeeId: employee.id, siteId: site.id, endsAt: { gt: now } },
        include: { post: true, site: true },
        orderBy: { startsAt: 'asc' },
        take: 40,
      });
      const next = upcoming.find(shiftIsPublished) ?? null;
      sites.push({
        id: site.id,
        name: site.name,
        type: site.type,
        isPrimary,
        nextShift: next && {
          date: localDate(next.startsAt, site.timezone),
          start: localTime(next.startsAt, site.timezone),
          end: localTime(next.endsAt, site.timezone),
          postName: next.post.name,
        },
      });
    }

    return {
      ...base,
      employee: {
        ...person(employee),
        contractMinutes:
          contract?.weeklyHours != null
            ? Math.round(Number(contract.weeklyHours) * 60)
            : null,
        forfaitJours: contract?.forfaitJours ?? false,
        sites,
        posts: employee.posts.map(({ post }) => ({
          id: post.id,
          name: post.name,
          color: post.color,
          department: post.department,
        })),
      },
    };
  }

  /**
   * My week across all my restaurants: shifts with the people I work with,
   * my absences, my requests still waiting, and my totals.
   */
  async week(user: SessionUser, monday: string) {
    const employeeId = this.employeeIdOrThrow(user);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const from = zonedDateTime(monday, '00:00', ZONE);
    const to = zonedDateTime(addDays(monday, 7), '00:00', ZONE);
    const now = new Date();

    const [allMine, absences, requests, employee, upcoming] = await Promise.all([
      this.prisma.shift.findMany({
        where: { employeeId, startsAt: { gte: from, lt: to } },
        include: { post: true, site: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.absence.findMany({
        where: {
          employeeId,
          startDate: { lte: toDbDate(dates[6]) },
          endDate: { gte: toDbDate(monday) },
        },
        include: { type: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId,
          status: 'PENDING',
          startDate: { lte: toDbDate(dates[6]) },
          endDate: { gte: toDbDate(monday) },
        },
        include: { type: true },
      }),
      this.prisma.employee.findUniqueOrThrow({
        where: { id: employeeId },
        include: {
          contracts: {
            where: {
              startDate: { lte: toDbDate(dates[6]) },
              OR: [{ endDate: null }, { endDate: { gte: toDbDate(monday) } }],
            },
            orderBy: { startDate: 'desc' },
            take: 1,
          },
          assignments: { include: { site: true }, orderBy: { isPrimary: 'desc' } },
        },
      }),
      // The coming shifts, to find the next one whatever week is looked at.
      this.prisma.shift.findMany({
        where: { employeeId, endsAt: { gt: now } },
        include: { post: true, site: true },
        orderBy: { startsAt: 'asc' },
        take: 40,
      }),
    ]);

    // Only what has been published is shown.
    const mySites = employee.assignments.map(({ site }) => site);
    const { shiftIsPublished, weekState } = await this.publications.visibility(
      [...new Set([...mySites.map((site) => site.id), ...allMine.map((s) => s.siteId)])],
    );
    const mine = allMine.filter(shiftIsPublished);
    const next = upcoming.find(shiftIsPublished) ?? null;

    // Everyone else's shifts at the same restaurants, to find who I work with.
    const toDescribe = next && !mine.some((s) => s.id === next.id) ? [...mine, next] : mine;
    const others = toDescribe.length
      ? await this.prisma.shift.findMany({
          where: {
            employeeId: { not: employeeId },
            siteId: { in: [...new Set(toDescribe.map((s) => s.siteId))] },
            startsAt: {
              gte: new Date(Math.min(...toDescribe.map((s) => s.startsAt.getTime())) - DAY),
              lt: new Date(Math.max(...toDescribe.map((s) => s.endsAt.getTime()))),
            },
          },
          include: { post: true, employee: true, site: true },
          orderBy: { startsAt: 'asc' },
        })
      : [];
    const publishedOthers = others.filter(shiftIsPublished);

    const describe = (shift: (typeof mine)[number]) => ({
      id: shift.id,
      date: localDate(shift.startsAt, shift.site.timezone),
      start: localTime(shift.startsAt, shift.site.timezone),
      end: localTime(shift.endsAt, shift.site.timezone),
      site: { id: shift.site.id, name: shift.site.name },
      postName: shift.post.name,
      service: shift.service,
      color: shift.post.color,
      minutes: plannedMinutes(shift.startsAt, shift.endsAt, shift.breakMinutes),
      // Working together = same restaurant, hours that overlap mine.
      coworkers: publishedOthers
        .filter(
          (other, index, all) =>
            other.siteId === shift.siteId &&
            other.startsAt < shift.endsAt &&
            other.endsAt > shift.startsAt &&
            // Someone with two shifts over mine is still one colleague.
            all.findIndex(
              (o) =>
                o.employeeId === other.employeeId &&
                o.siteId === shift.siteId &&
                o.startsAt < shift.endsAt &&
                o.endsAt > shift.startsAt,
            ) === index,
        )
        .map((other) => ({
          ...person(other.employee),
          postName: other.post.name,
          color: other.post.color,
        })),
    });

    const shifts = mine.map(describe);
    const contract = employee.contracts[0];
    const bySite = [...new Set(shifts.map((s) => s.site.id))].map((siteId) => {
      const there = shifts.filter((s) => s.site.id === siteId);
      return {
        site: there[0].site,
        shifts: there.length,
        minutes: there.reduce((sum, s) => sum + s.minutes, 0),
      };
    });

    return {
      from: monday,
      days: dates.map((date) => ({
        date,
        shifts: shifts.filter((s) => s.date === date),
        absences: absences
          .filter((a) => fromDbDate(a.startDate) <= date && date <= fromDbDate(a.endDate))
          .map((a) => ({
            id: a.id,
            typeName: a.type.name,
            dayPart: a.dayPart,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        requests: requests
          .filter((r) => fromDbDate(r.startDate) <= date && date <= fromDbDate(r.endDate))
          .map((r) => ({ id: r.id, typeName: r.type.name })),
      })),
      totalMinutes: shifts.reduce((sum, s) => sum + s.minutes, 0),
      contractMinutes:
        contract?.weeklyHours != null
          ? Math.round(Number(contract.weeklyHours) * 60)
          : null,
      bySite,
      // For each of my restaurants: how much of this week is published.
      sites: mySites.map((site) => ({
        id: site.id,
        name: site.name,
        published: weekState(site.id, monday),
      })),
      nextShift: next ? describe(next) : null,
    };
  }

  /**
   * The week of one restaurant, as its staff see it: who works, when, on
   * which post. No absences and no reasons: only the line-up.
   */
  async siteWeek(user: SessionUser, siteId: string, monday: string) {
    await this.access.assertCanSeePlanning(user, siteId);
    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const { weekState, shiftIsPublished } = await this.publications.visibility([siteId]);
    const published = weekState(siteId, monday);
    const allShifts = await this.prisma.shift.findMany({
      where: {
        siteId,
        startsAt: {
          gte: zonedDateTime(monday, '00:00', site.timezone),
          lt: zonedDateTime(addDays(monday, 7), '00:00', site.timezone),
        },
      },
      include: { post: true, employee: true },
      orderBy: { startsAt: 'asc' },
    });
    // Only the departments that have been published.
    const shifts = allShifts.filter((shift) => shiftIsPublished({ ...shift, site }));
    const lines = shifts.map((shift) => ({
      id: shift.id,
      date: localDate(shift.startsAt, site.timezone),
      start: localTime(shift.startsAt, site.timezone),
      end: localTime(shift.endsAt, site.timezone),
      service: shift.service,
      postName: shift.post.name,
      color: shift.post.color,
      department: shift.post.department,
      employee: person(shift.employee),
      isMe: shift.employeeId === user.employeeId,
    }));
    return {
      site: { id: site.id, name: site.name },
      published,
      days: dates.map((date) => ({
        date,
        lines: lines.filter((line) => line.date === date),
      })),
    };
  }

  private employeeIdOrThrow(user: SessionUser): string {
    if (!user.employeeId) {
      throw new BadRequestException("Ce compte n'est pas rattaché à un salarié");
    }
    return user.employeeId;
  }
}
