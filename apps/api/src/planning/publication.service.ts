import { Injectable } from '@nestjs/common';
import { localDate, mondayOf } from '@skellobis/labor-rules';
import { PrismaService } from '../core/prisma.service.js';
import type { Department } from '../generated/prisma/enums.js';

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
export const DEPARTMENTS: Department[] = ['KITCHEN', 'SALLE'];

/** How much of a site's week the staff can see. */
export type PublishedState = 'ALL' | 'PARTIAL' | 'NONE';

/**
 * Which parts of the planning the staff may see. Kitchen and salle are
 * published separately, week by week: a shift is visible to employees only
 * when the week it starts in has been published for its post's department.
 */
@Injectable()
export class PublicationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the tests "is this shift published?" and "how much of this week?" */
  async visibility(siteIds: string[]) {
    const published = await this.prisma.publication.findMany({
      where: { siteId: { in: siteIds } },
    });
    const keys = new Set(
      published.map(
        (p) => `${p.siteId}:${p.weekStart.toISOString().slice(0, 10)}:${p.department}`,
      ),
    );
    const departmentIsPublished = (
      siteId: string,
      monday: string,
      department: Department,
    ) => keys.has(`${siteId}:${monday}:${department}`);

    return {
      departmentIsPublished,
      weekState: (siteId: string, monday: string): PublishedState => {
        const count = DEPARTMENTS.filter((department) =>
          departmentIsPublished(siteId, monday, department),
        ).length;
        return count === 0 ? 'NONE' : count === DEPARTMENTS.length ? 'ALL' : 'PARTIAL';
      },
      shiftIsPublished: (shift: {
        siteId: string;
        startsAt: Date;
        site: { timezone: string };
        post: { department: Department };
      }) =>
        departmentIsPublished(
          shift.siteId,
          mondayOf(localDate(shift.startsAt, shift.site.timezone)),
          shift.post.department,
        ),
    };
  }

  /** When each department of a week was published, or null. */
  async ofWeek(siteId: string, monday: string) {
    const rows = await this.prisma.publication.findMany({
      where: { siteId, weekStart: toDbDate(monday) },
    });
    const at = (department: Department) =>
      rows.find((row) => row.department === department)?.publishedAt ?? null;
    return { KITCHEN: at('KITCHEN'), SALLE: at('SALLE') };
  }

  async set(
    siteId: string,
    monday: string,
    department: Department,
    published: boolean,
    userId: string,
  ) {
    const weekStart = toDbDate(monday);
    if (published) {
      await this.prisma.publication.upsert({
        where: { siteId_weekStart_department: { siteId, weekStart, department } },
        update: {}, // already published: keep the original date
        create: { siteId, weekStart, department, publishedById: userId },
      });
    } else {
      await this.prisma.publication.deleteMany({
        where: { siteId, weekStart, department },
      });
    }
  }
}
