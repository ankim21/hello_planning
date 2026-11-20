/**
 * Copies a restaurant's planning from files taken out of Skello: the shifts
 * on the posts known here, and the full-day absences.
 *
 * Run after import-skello.ts (people are matched by their Skello number).
 * Safe to run again: an identical shift or absence is not created twice.
 * Prints counts only. Run: npx tsx prisma/import-skello-planning.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zonedDateTime } from '@skellobis/labor-rules';
import { createClient } from './client.js';

const SITE = 'Petit Bao Bastille';
const SKELLO_SHOP_ID = 20980;
const DIR = join(import.meta.dirname, '../../../data/skello-import');

interface SkelloShift {
  u: number;
  p: number;
  s: string; // Skello gives the time on the restaurant's clock, written as UTC
  e: string;
  shop: number;
  pause: number | null; // seconds
  meal: number | null;
  note: string | null;
}
interface Named { id: number; name: string }

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as T;
const clean = (name: string) =>
  name.replace(/[^\p{L}\p{N} &]/gu, '').replace(/\s+/g, ' ').trim();
const dbDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

const prisma = createClient();

async function main() {
  const shifts = read<SkelloShift[]>('week-shifts').filter((s) => s.shop === SKELLO_SHOP_ID);
  const postes = new Map(read<Named[]>('postes').map((p) => [p.id, clean(p.name)]));
  const absenceNames = new Map(read<Named[]>('absences').map((a) => [a.id, a.name.trim()]));

  const site = await prisma.site.findUniqueOrThrow({ where: { name: SITE } });
  const author = await prisma.user.findFirstOrThrow({
    where: { roleGrants: { some: { role: 'ADMIN' } } },
  });
  const employees = await prisma.employee.findMany({ where: { skelloId: { not: null } } });
  const employeeId = new Map(employees.map((e) => [e.skelloId!, e.id]));
  const postId = new Map((await prisma.post.findMany()).map((p) => [p.name, p.id]));
  const typeId = new Map((await prisma.absenceType.findMany()).map((t) => [t.name, t.id]));

  const report = { read: shifts.length, shifts: 0, absences: 0, alreadyThere: 0 };
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);

  for (const row of shifts) {
    const employee = employeeId.get(String(row.u));
    if (!employee) {
      skip('person not imported');
      continue;
    }
    const day = row.s.slice(0, 10);

    const absence = absenceNames.get(row.p);
    if (absence) {
      const absenceTypeId = typeId.get(absence);
      if (!absenceTypeId) {
        skip(`absence type unknown here: ${absence}`);
        continue;
      }
      const data = { employeeId: employee, absenceTypeId, startDate: dbDate(day), endDate: dbDate(day) };
      if (await prisma.absence.findFirst({ where: data })) report.alreadyThere += 1;
      else {
        await prisma.absence.create({ data: { ...data, createdById: author.id } });
        report.absences += 1;
      }
      continue;
    }

    // "Pass PM" → the post "Pass", service PM.
    const skelloName = postes.get(row.p) ?? '';
    // A Skello post without AM / PM ("Office") is filed by its start time:
    // AM when it starts before 15:00.
    const match = /^(.*) (AM|PM)$/.exec(skelloName);
    const post = postId.get(match ? match[1] : skelloName);
    if (!post) {
      skip(`post not created here: ${skelloName || 'unknown'}`);
      continue;
    }
    const service = match ? (match[2] as 'AM' | 'PM') : row.s.slice(11, 16) < '15:00' ? 'AM' : 'PM';
    const data = {
      siteId: site.id,
      employeeId: employee,
      postId: post,
      service,
      startsAt: zonedDateTime(day, row.s.slice(11, 16), site.timezone),
      endsAt: zonedDateTime(row.e.slice(0, 10), row.e.slice(11, 16), site.timezone),
    };
    if (await prisma.shift.findFirst({ where: data })) {
      report.alreadyThere += 1;
      continue;
    }
    await prisma.shift.create({
      data: {
        ...data,
        breakMinutes: Math.round((row.pause ?? 0) / 60),
        meals: row.meal ?? 0,
        note: row.note?.trim() || null,
        createdById: author.id,
      },
    });
    report.shifts += 1;
  }

  console.log({ site: SITE, ...report, skipped });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
