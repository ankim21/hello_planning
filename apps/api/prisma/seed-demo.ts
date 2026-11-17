/**
 * FAKE data for development only: invented employees, a tablet and today's
 * shifts at one site, so the time clock can be tried without PayFit.
 * Refuses to run in production. Run after the main seed: npm run db:seed:demo
 */
import { addDays, localDate, zonedDateTime } from '@skellobis/labor-rules';
import { hashSecret } from '../src/auth/password.js';
import { hashDeviceToken } from '../src/devices/device.guard.js';
import { createClient } from './client.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The demo seed must never run in production.');
}

const prisma = createClient();
const SITE = 'Petit Bao Bastille';
const DEMO_PIN = '1234';
const DEMO_PASSWORD = 'dev-password-123';
export const DEMO_DEVICE_TOKEN = 'demo-tablet-token-for-development-only';

async function main() {
  const site = await prisma.site.findUniqueOrThrow({ where: { name: SITE } });
  if (await prisma.employee.findFirst({ where: { lastName: 'Démo' } })) {
    await employeeLogins();
    console.log('Demo data already present; employee logins checked.');
    return;
  }
  const post = async (name: string) =>
    (await prisma.post.findUniqueOrThrow({ where: { name } })).id;
  const pinHash = await hashSecret(DEMO_PIN);

  const person = async (
    firstName: string,
    lastName: string,
    postNames: string[],
    contract: { weeklyHours?: number; forfaitJours?: boolean },
  ) =>
    prisma.employee.create({
      data: {
        firstName,
        lastName,
        pinHash,
        assignments: { create: { siteId: site.id, isPrimary: true } },
        posts: { create: await Promise.all(postNames.map(async (n) => ({ postId: await post(n) }))) },
        contracts: {
          create: {
            legalEntityId: site.legalEntityId,
            type: 'CDI',
            weeklyHours: contract.weeklyHours,
            forfaitJours: contract.forfaitJours ?? false,
            startDate: new Date('2026-01-01'),
          },
        },
      },
    });

  const alice = await person('Alice', 'Démo', ['Chef de rang', 'Runner'], { weeklyHours: 39 });
  const bob = await person('Bob', 'Demont', ['Bao Cook', 'Plonge'], { weeklyHours: 35 });
  const chloe = await person('Chloé', 'Exemple', ['Bar'], { weeklyHours: 25 });
  const dan = await person('Dan', 'Directeur', ['Manager'], { forfaitJours: true });
  const eve = await person('Eve', 'Cheffe', ['Pass'], { weeklyHours: 39 });

  const user = async (email: string, employeeId: string, role: 'SITE_DIRECTOR' | 'HEAD_CHEF') =>
    prisma.user.create({
      data: {
        email,
        employeeId,
        passwordHash: await hashSecret(DEMO_PASSWORD),
        roleGrants: { create: { role, siteId: site.id } },
      },
    });
  const director = await user('director@example.com', dan.id, 'SITE_DIRECTOR');
  await user('chef@example.com', eve.id, 'HEAD_CHEF');

  await prisma.device.create({
    data: {
      name: 'Demo tablet',
      siteId: site.id,
      tokenHash: hashDeviceToken(DEMO_DEVICE_TOKEN),
    },
  });

  // Today's planning, in the site's own time.
  const today = localDate(new Date(), site.timezone);
  const at = (time: string) => zonedDateTime(today, time, site.timezone);
  const shift = async (
    employeeId: string,
    postName: string,
    service: 'AM' | 'PM',
    start: string,
    end: string,
  ) =>
    prisma.shift.create({
      data: {
        siteId: site.id,
        employeeId,
        postId: await post(postName),
        service,
        startsAt: at(start),
        endsAt: at(end),
        createdById: director.id,
      },
    });
  await shift(alice.id, 'Chef de rang', 'AM', '10:00', '15:00'); // coupure
  await shift(alice.id, 'Chef de rang', 'PM', '18:00', '23:00');
  await shift(bob.id, 'Bao Cook', 'AM', '11:00', '16:00');
  void chloe; // no shift: clocking in shows the "unplanned" warning
  await employeeLogins();

  console.log(`Demo data created at ${SITE}.
  Employees    : alice@example.com (salle), bob@example.com (kitchen), same password
  Tablet token : ${DEMO_DEVICE_TOKEN}
  PIN (all)    : ${DEMO_PIN}
  Logins       : director@example.com, chef@example.com / ${DEMO_PASSWORD}`);
}

/** Plain employee accounts, to try leave requests: no role, just a login. */
async function employeeLogins() {
  for (const [email, lastName] of [
    ['alice@example.com', 'Démo'],
    ['bob@example.com', 'Demont'],
  ]) {
    const employee = await prisma.employee.findFirstOrThrow({ where: { lastName } });
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        employeeId: employee.id,
        passwordHash: await hashSecret(DEMO_PASSWORD),
      },
    });
  }
  await secondRestaurant();
  // Two office accounts, not linked to an employee: the operations team sees
  // every site; the multi-site manager runs this one (and would run others).
  const site = await prisma.site.findUniqueOrThrow({ where: { name: SITE } });
  for (const [email, role, siteId] of [
    ['ops@example.com', 'OPS', null],
    ['multi@example.com', 'MULTI_SITE_MANAGER', site.id],
  ] as const) {
    if (await prisma.user.findUnique({ where: { email } })) continue;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashSecret(DEMO_PASSWORD),
        roleGrants: { create: { role, siteId } },
      },
    });
  }
}

/** Alice also works at a second restaurant, to show a week across two sites. */
async function secondRestaurant() {
  const alice = await prisma.employee.findFirstOrThrow({ where: { lastName: 'Démo' } });
  const other = await prisma.site.findUniqueOrThrow({ where: { name: 'Gros Bao Paris' } });
  const already = await prisma.siteAssignment.findUnique({
    where: { employeeId_siteId: { employeeId: alice.id, siteId: other.id } },
  });
  if (already) return;
  await prisma.siteAssignment.create({ data: { employeeId: alice.id, siteId: other.id } });
  const admin = await prisma.user.findFirstOrThrow({
    where: { roleGrants: { some: { role: 'ADMIN' } } },
  });
  const runner = await prisma.post.findUniqueOrThrow({ where: { name: 'Runner' } });
  const day = addDays(localDate(new Date(), other.timezone), 2);
  await prisma.shift.create({
    data: {
      siteId: other.id,
      employeeId: alice.id,
      postId: runner.id,
      service: 'PM',
      startsAt: zonedDateTime(day, '18:30', other.timezone),
      endsAt: zonedDateTime(addDays(day, 1), '00:00', other.timezone),
      createdById: admin.id,
    },
  });
}

await main().finally(() => prisma.$disconnect());
