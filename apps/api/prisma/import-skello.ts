/**
 * Loads one restaurant's staff from files taken out of Skello.
 *
 * The files hold real personal data and badge PINs. They live in
 * data/skello-import/, which is never committed, and nothing personal is
 * printed here: only counts.
 *
 * Safe to run again: people are recognised by their Skello number.
 * Run: npx tsx prisma/import-skello.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashSecret } from '../src/auth/password.js';
import { createClient } from './client.js';

const SITE = 'Petit Bao Bastille';
const SKELLO_SHOP_ID = 20980;
const DIR = join(import.meta.dirname, '../../../data/skello-import');

/** Skello's contract type numbers, read from its contract screens. */
const CONTRACT_TYPES = {
  1: 'CDI',
  2: 'CDD',
  4: 'APPRENTICE',
  9: 'TEMPORARY',
  10: 'EXTRA',
  11: 'INTERN',
} as const;

/**
 * The work posts really planned at Bastille in the ten weeks before the
 * import. In Skello each exists twice ("Pass AM", "Pass PM"); here AM / PM is
 * chosen on the shift. The department is the team of the people who held the
 * post, which was the same for every shift.
 */
const POSTS: Record<string, { department: 'KITCHEN' | 'SALLE'; color: string }> = {
  Service: { department: 'SALLE', color: '#FFD06C' },
  Manager: { department: 'SALLE', color: '#FECACA' },
  Pass: { department: 'KITCHEN', color: '#CCCCFF' },
  'Wok 1': { department: 'KITCHEN', color: '#FED7AA' },
  'Wok 2': { department: 'KITCHEN', color: '#FFD06C' },
  'Bao Cook': { department: 'KITCHEN', color: '#A7F3D0' },
  'Kitchen Prep': { department: 'KITCHEN', color: '#CCE2FF' },
  // Desk time of the director and the multi-site directors. Filed under
  // salle so that a head chef, who plans the kitchen only, cannot plan it.
  Office: { department: 'SALLE', color: '#34D381' },
};

interface SkelloEmployee {
  id: string;
  fn: string;
  ln: string;
  shopName: string;
  day: boolean;
  hrs: number;
  ct: keyof typeof CONTRACT_TYPES;
  cStart: string | null;
  cEnd: string | null;
  comp: string[];
  pin: string;
}
interface SkelloPoste { id: number; name: string }
interface SkelloShift { u: number; p: number; shop: number }

const read = <T>(name: string): T =>
  JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as T;

/** "🥟 Bao Cook PM " → "Bao Cook". */
const baseName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} &]/gu, '')
    .replace(/\s+(AM|PM)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const dateOnly = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

const prisma = createClient();

async function main() {
  const employees = read<SkelloEmployee[]>('employees');
  const postes = read<SkelloPoste[]>('postes');
  const shifts = read<SkelloShift[]>('shifts');

  const sites = await prisma.site.findMany();
  const siteByName = new Map(sites.map((site) => [site.name.toLowerCase(), site]));
  const bastille = siteByName.get(SITE.toLowerCase());
  if (!bastille) throw new Error(`Site not found: ${SITE}`);

  // Posts: existing ones (Pass, Bao Cook, Manager) are kept as they are.
  const postIdByName = new Map<string, string>();
  let postsCreated = 0;
  for (const [name, { department, color }] of Object.entries(POSTS)) {
    const existing = await prisma.post.findUnique({ where: { name } });
    if (!existing) postsCreated += 1;
    const post =
      existing ?? (await prisma.post.create({ data: { name, department, color } }));
    postIdByName.set(name, post.id);
  }
  const postNameBySkelloId = new Map(postes.map((poste) => [poste.id, baseName(poste.name)]));

  // Who holds which post: what Skello lists for the person, plus the posts
  // they were really planned on at Bastille.
  const postsOf = new Map<string, Set<string>>();
  const hold = (skelloUser: string, skelloPoste: number) => {
    const postId = postIdByName.get(postNameBySkelloId.get(skelloPoste) ?? '');
    if (!postId) return;
    if (!postsOf.has(skelloUser)) postsOf.set(skelloUser, new Set());
    postsOf.get(skelloUser)!.add(postId);
  };
  for (const employee of employees)
    for (const competency of employee.comp) hold(employee.id, Number(competency.replace('*', '')));
  for (const shift of shifts)
    if (shift.shop === SKELLO_SHOP_ID) hold(String(shift.u), shift.p);

  const report = { created: 0, updated: 0, withoutContract: 0, withPosts: 0, unknownSite: 0 };

  for (const row of employees) {
    if (!/^\d{4}$/.test(row.pin)) throw new Error('A PIN is not four digits; nothing more was imported.');
    const primary = siteByName.get(row.shopName.toLowerCase());
    if (!primary) report.unknownSite += 1;
    const postIds = [...(postsOf.get(row.id) ?? [])];
    if (postIds.length) report.withPosts += 1;

    const existing = await prisma.employee.findUnique({ where: { skelloId: row.id } });
    const identity = {
      firstName: row.fn.trim(),
      lastName: row.ln.trim(),
      pinHash: await hashSecret(row.pin),
    };
    const employee = existing
      ? await prisma.employee.update({ where: { id: existing.id }, data: identity })
      : await prisma.employee.create({ data: { ...identity, skelloId: row.id } });
    report[existing ? 'updated' : 'created'] += 1;

    // Where they work: Bastille, and their own restaurant as the main one.
    const siteIds = new Set([bastille.id, ...(primary ? [primary.id] : [])]);
    for (const siteId of siteIds) {
      const isPrimary = siteId === (primary ?? bastille).id;
      await prisma.siteAssignment.upsert({
        where: { employeeId_siteId: { employeeId: employee.id, siteId } },
        create: { employeeId: employee.id, siteId, isPrimary },
        update: { isPrimary },
      });
    }
    for (const postId of postIds) {
      await prisma.employeePost.upsert({
        where: { employeeId_postId: { employeeId: employee.id, postId } },
        create: { employeeId: employee.id, postId },
        update: {},
      });
    }

    // The contract as Skello shows it. Skello has no start date for some
    // extras; no contract is invented for them.
    if (!row.cStart) {
      report.withoutContract += 1;
      continue;
    }
    const contract = {
      legalEntityId: (primary ?? bastille).legalEntityId,
      type: CONTRACT_TYPES[row.ct],
      weeklyHours: row.day || !row.hrs ? null : row.hrs,
      forfaitJours: row.day,
      startDate: dateOnly(row.cStart),
      endDate: row.cEnd ? dateOnly(row.cEnd) : null,
    };
    const current = await prisma.contract.findFirst({ where: { employeeId: employee.id } });
    if (current) await prisma.contract.update({ where: { id: current.id }, data: contract });
    else await prisma.contract.create({ data: { ...contract, employeeId: employee.id } });
  }

  // The order of the rows in Skello's planning ("order" holds the names as
  // listed there). People Skello leaves out of its planning come after.
  const order = read<string[]>('order');
  const norm = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();
  const skelloIdByName = new Map(employees.map((e) => [norm(`${e.fn} ${e.ln}`), e.id]));
  let ordered = 0;
  await prisma.siteAssignment.updateMany({
    where: { siteId: bastille.id },
    data: { planningOrder: null },
  });
  for (const [index, name] of order.entries()) {
    const skelloId = skelloIdByName.get(norm(name));
    const employee = skelloId && (await prisma.employee.findUnique({ where: { skelloId } }));
    if (!employee) continue;
    await prisma.siteAssignment.update({
      where: { employeeId_siteId: { employeeId: employee.id, siteId: bastille.id } },
      data: { planningOrder: index + 1 },
    });
    ordered += 1;
  }

  console.log({ site: SITE, read: employees.length, postsCreated, ...report, inSkelloOrder: `${ordered}/${order.length}` });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
