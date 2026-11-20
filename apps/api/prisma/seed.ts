/**
 * Reference data every environment needs: legal entities, sites, posts and
 * the first administrator. Safe to run again: it never duplicates.
 *
 * Run with: npm run db:seed
 */
import { readFileSync } from 'node:fs';
import { hashSecret } from '../src/auth/password.js';
import type {
  AbsenceCategory,
  Department,
  SiteType,
} from '../src/generated/prisma/enums.js';
import { createClient } from './client.js';

const prisma = createClient();

interface AbsenceTypeSeed {
  name: string;
  category: AbsenceCategory;
  isActive: boolean;
  earnsLeave: boolean;
  compensatoryIndemnity: boolean;
  employeeCanRequest: boolean;
  overtimeMajorees: boolean | null;
  blocksPlanning: boolean;
}

// [legal entity, site, type] — as given by the company, 2026-11-16.
const STRUCTURE: [string, string, SiteType][] = [
  ['Bao Lab', 'Bao Lab', 'LAB'],
  ['Bao Express', 'Petit Bao Bastille', 'RESTAURANT'],
  ['Petit Bao', 'Petit Bao EM', 'RESTAURANT'],
  ['Gros Bao', 'Gros Bao Paris', 'RESTAURANT'],
  ['Bao Bar', 'Bleu Bao', 'RESTAURANT'],
  ['Gros Bao Marseille', 'Gros Bao Marseille', 'RESTAURANT'],
  ['Street Bangkok Odeon', 'Petit Bao Saint Germain', 'RESTAURANT'],
  ['Street Bangkok Pigalle', 'Petit Bao Pigalle', 'RESTAURANT'],
  ['Petit Bao Ternes', 'Petit Bao Ternes', 'RESTAURANT'],
  ['Petit Bao FSD', 'Petit Bao FSD', 'RESTAURANT'],
  ['Petit Bao Bercy', 'Petit Bao Bercy', 'RESTAURANT'],
  ['Street Bangkok EM', 'Street Bangkok Etienne Marcel', 'RESTAURANT'],
  ['Bao Family', 'Bao Family', 'OFFICE'],
];

// [post, department, colour of its cards on the planning]
const POSTS: [string, Department, string][] = [
  ['Pass', 'KITCHEN', '#dc2626'],
  ['Master Wok', 'KITCHEN', '#ea580c'],
  ['Bao Master', 'KITCHEN', '#ca8a04'],
  ['Bao Cook', 'KITCHEN', '#65a30d'],
  ['Plonge', 'KITCHEN', '#0d9488'],
  ['Manager', 'SALLE', '#db2777'],
  ['Chef de rang', 'SALLE', '#2563eb'],
  ['Bar', 'SALLE', '#7c3aed'],
  ['Runner', 'SALLE', '#0891b2'],
];

async function main() {
  for (const [entityName, siteName, type] of STRUCTURE) {
    const entity = await prisma.legalEntity.upsert({
      where: { name: entityName },
      update: {},
      create: { name: entityName },
    });
    await prisma.site.upsert({
      where: { name: siteName },
      update: {},
      create: { name: siteName, type, legalEntityId: entity.id },
    });
  }

  for (const [name, department, color] of POSTS) {
    await prisma.post.upsert({
      where: { name },
      update: {},
      create: { name, department, color },
    });
  }

  // The manager of a service is the person staff call at the last minute.
  await prisma.post.updateMany({
    where: { name: 'Manager' },
    data: { isServiceLead: true },
  });

  // Absence types, generated from docs/reference/absence-types.md.
  const absenceTypes: AbsenceTypeSeed[] = JSON.parse(
    readFileSync(new URL('./data/absence-types.json', import.meta.url), 'utf8'),
  );
  for (const type of absenceTypes) {
    await prisma.absenceType.upsert({
      where: { name: type.name },
      update: {},
      create: type,
    });
  }

  // A day of paid leave or of récupération JF counts as worked hours in the
  // weekly counter. After the types are created, so it holds on a first run.
  await prisma.absenceType.updateMany({
    where: { name: { in: ['Congé payé', 'Récupération JF'] } },
    data: { countsInCounter: true },
  });

  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env');
  }
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: await hashSecret(password) },
  });
  const hasGrant = await prisma.roleGrant.findFirst({
    where: { userId: admin.id, role: 'ADMIN', siteId: null },
  });
  if (!hasGrant) {
    await prisma.roleGrant.create({ data: { userId: admin.id, role: 'ADMIN' } });
  }

  console.log(
    `Seeded ${STRUCTURE.length} entities and sites, ${POSTS.length} posts, administrator ${email}.`,
  );
}

await main().finally(() => prisma.$disconnect());
