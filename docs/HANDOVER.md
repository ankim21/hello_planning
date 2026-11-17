# PLANetBAO — Handover

Written 2026-11-17, at commit `f4d0dbf`. For an agent or developer taking the
project over with no access to the conversations that produced it.

Read this first, then the three documents it points to:

| Document | What it is | Trust it for |
|---|---|---|
| [workflows.md](workflows.md) | What the code does today, workflow by workflow | Current behaviour |
| [spec-brick-1.md](spec-brick-1.md) | Every requirement, tagged Confirmed / Proposed / Open | What was asked, and what is still undecided |
| [architecture.md](architecture.md) | Stack, module boundaries, design principles | How it is built and why |

`workflows.md` section 9 onwards predates the last commit in places; section
5 and 3 are current. When they disagree, the code wins, then this file.

---

## 1. What this is

**PLANetBAO** is an in-house replacement for Skello (French workforce
scheduling SaaS) for Bao Family, a restaurant group: 13 legal entities, each
with one site (11 restaurants, a lab, an office), about 250 employees,
collective agreement HCR (IDCC 1979).

The company goal is to internalise its SaaS tools. The project folder is
called `Skellobis`; the product is called PLANetBAO.

**Scope so far ("brick 1"):** planning, time clock (badgeuse), leave requests.
**Not started:** HR administration, payroll export, reports, finance analysis.

**Immediate goal:** pilot the *planning only* in one restaurant, with Skello
kept running in parallel for clocking and pay. Not pay. See section 9.

**The owner** is the person you talk to. They work in operations, are
comfortable with TypeScript / React / NestJS / Prisma / PostgreSQL, and want
to understand the code well enough to maintain it. They relay feedback from a
site director, a multi-site director, HR and their supervisor.

---

## 2. How the owner wants you to work

These were stated explicitly, more than once. Breaking them costs trust.

1. **Do not guess. Do not fill in the blanks.** When a rule or a screen's
   content is unknown, ask. This is the single most repeated instruction.
2. **Say which choices were yours.** Every time you decide something that was
   not asked, list it for confirmation. In the spec this is the "Proposed"
   status. Pay-affecting rules must never be assumed.
3. **Decisions get reversed; the latest wins.** Leave approval changed three
   times, vertical spacing was asked to grow and then to shrink on the
   planning. Record the date when a rule changes.
4. **Commit only when asked.** They say "commit this". There is no remote.
5. **Report honestly.** Say what was tested and how, what was not, and what
   broke along the way.
6. **The interface is in French.** Code, comments and docs are in English.
7. **Mirror Skello where they point at it.** Many requests arrive as Skello
   screenshots. Reproduce the behaviour, not the branding.
8. **Keep the three documents current** as part of each change.
9. **Short answers to button questions.** They often answer a yes/no question
   with one phrase; confirm what you understood before acting on an ambiguous one.

Code style they asked for: simple, readable, comments that explain *why*.
Business rules live in one place each (see section 5).

---

## 3. Running it

Needs Node 24 and Docker. Everything below is from the project root.

```bash
npm install
cp apps/api/.env.example apps/api/.env     # set JWT_SECRET and the admin password
npm run db:up                              # PostgreSQL :5433 and a fake mailbox :8025
npm run db:migrate
npm run generate -w api
npm run db:seed                            # entities, sites, posts, absence types, admin
npm run db:seed:demo                       # fake people, a tablet, some shifts (dev only)
npm run dev:api                            # http://localhost:3000
npm run dev:web                            # http://localhost:5173
npm test                                   # 84 tests
```

**Demo accounts** (all invented, password `dev-password-123`, site Petit Bao Bastille):

| Login | Role |
|---|---|
| `admin@example.com` | Administrator, all sites, no employee record |
| `director@example.com` | Site director (employee Dan Directeur, forfait jours) |
| `chef@example.com` | Head chef (employee Eve Cheffe) |
| `multi@example.com` | Multi-site manager, no employee record |
| `ops@example.com` | Operations team, all sites, no employee record |
| `alice@example.com` | Employee, salle, works at two restaurants |
| `bob@example.com` | Employee, kitchen |
| `chloe@example.com` | Employee with Manager role; its password was changed in a test, send a link from Comptes |

The owner also created one real account of their own (role Head chef, no
employee record yet). Leave it alone unless asked.

- Tablet: `/kiosk`, code `demo-tablet-token-for-development-only`, PIN `1234`.
- Fake mailbox: http://localhost:8025 — every e-mail the app sends lands there.
- The dev database contains leftovers from manual tests (odd shifts, requests).
  It is disposable.

---

## 4. Technical facts you will trip over

Versions are newer than most training data. Check docs before assuming.

- **NestJS 12 is ESM-only.** Relative imports end in `.js`. Tests use Vitest.
  Validation is `StandardSchemaValidationPipe` with `@Body({ schema })` and
  Zod 4 (`z.uuid()`, `z.email()`). `apps/api/AGENTS.md` comes from the Nest
  template; its suggestion to send production telemetry to a hosted service
  was not followed and should not be without the owner's decision.
- **Prisma 7, deliberately not the Prisma 8 release candidate.** Config is in
  `apps/api/prisma.config.ts`; the client is generated into
  `apps/api/src/generated/prisma` (git-ignored) and needs
  `npm run generate -w api` after every schema change.
- **`prisma migrate dev` refuses to run non-interactively when a change loses
  data.** Then write the migration SQL by hand in a new folder under
  `prisma/migrations/` and run `npx prisma migrate deploy`. One such
  migration failed half-way once; it was repaired with
  `prisma migrate resolve --rolled-back` and a corrected file.
- **Build order matters.** `packages/labor-rules` compiles to `dist/` and both
  the API and the web app import it. Rebuild it (`npm run build:rules`) after
  changing it, before type-checking the others.
- **The API does not hot-reload in the way it was run here.** After
  `npm run build -w api`, restart the process.
- **npm workspaces**, not pnpm. TypeScript 6 in the API, 7 in the web app.
- **Web**: Vite proxies `/api` to the API, so the login cookie is same-origin.
- **Browser checks** were done with `playwright-core` driving a Chromium
  already cached at `~/.cache/ms-playwright/chromium-1208`. There are no
  permanent end-to-end tests; the scripts were throwaway.
- **Timezones**: all instants are stored in UTC; each site has a timezone
  (all `Europe/Paris`). The server converts to wall-clock strings so the
  browser never does timezone math. Dates travel as `YYYY-MM-DD` strings.

---

## 5. Where things live

```
apps/api/src/
  access/        permissions.ts (the rights table), session guard, AccessService
  auth/          login, password change, one-time password links
  accounts/      accounts and roles; employee records
  org/ people/   sites, posts, employees of a site, PIN
  devices/       tablets
  planning/      shifts, absences, day locks, publication, needs, popular shifts, alerts wiring
  timeclock/     tablet endpoints, hours computation, validation (Badgeuse)
  leave/         leave requests; leave.rules.ts decides who approves and who sees
  me/            "Mon espace": the employee's own week and restaurants
  notifications/ the bell
  core/          Prisma, audit log, mail, notify
apps/api/prisma/ schema.prisma, migrations, seed.ts, seed-demo.ts, data/absence-types.json
apps/web/src/
  pages/         management screens (Planning, Badgeuse, Demandes, Comptes), Kiosk, Login
  me/            Mon espace (MyWeek, Restaurant, Leave, MyProfile), me.css
  api.ts         the only place the web app calls the server; all response types
packages/labor-rules/src/
  time-entry.ts      clocking → counted hours
  pairing.ts         clock events → pairs, pair → shift
  planning-alerts.ts the four planning alerts
  shift-defaults.ts  break / meal defaults, absence day value, counted absence hours
  zoned-time.ts      wall-clock ↔ instant, week helpers
```

**One place per rule:**

| To change… | Edit |
|---|---|
| Who may do what | `apps/api/src/access/permissions.ts` |
| Who approves or sees a leave request | `apps/api/src/leave/leave.rules.ts` |
| How clocked hours are counted | `packages/labor-rules/src/time-entry.ts` |
| Alert thresholds | `packages/labor-rules/src/planning-alerts.ts` |
| Break, meal and absence-day defaults | `packages/labor-rules/src/shift-defaults.ts` |
| Sites, posts, post colours | `apps/api/prisma/seed.ts` |

**Design principles that are load-bearing** (details in architecture.md):
- Planned (Shift), clocked (ClockEvent) and validated (TimeEntry) time are
  three separate things and are never merged.
- ClockEvent is append-only, enforced by a database trigger.
- Rights are "role on site"; a null site means the whole organisation.
- Every meaningful write goes to the audit log; never passwords or PINs.
- The server enforces everything; the screens only hide what would be refused.

---

## 6. The business rules, as confirmed

Each is in the spec with its ID. These are the ones easiest to get wrong.

**Counting clocked hours**
- Early clock-in: counted from the planned start. Late: from the clock-in.
- Late clock-out: up to 10 minutes not counted; beyond, only the minutes past
  the 10th (16 minutes late pays 6). The HR document says otherwise and is
  wrong on this; the owner confirmed.
- Early clock-out: counted to the actual time.
- Coupure: the end of the service *before the break* follows the plan
  whatever the clock-out; the end of the day follows the 10-minute rule.
- Forgotten clock-out: planned end, flagged. Unplanned clock-in: accepted,
  flagged.
- Break: the break set on the shift is deducted, on every shift whatever its
  length (so twice on a coupure). Default 20 minutes and one meal; **a shift
  starting at exactly 12:00 or 19:00 has no break and no meal.**

**Absences and counters**
- A whole day of absence is worth the weekly contract ÷ 5 (35h → 7h,
  39h → 7.8h); a half day is half.
- Everyone earns 2.08 days of paid leave per month whatever their hours
  (recorded as a constant, not used yet).
- A day of congé payé adds its value to the weekly counter, at most five days
  per week. No other absence type counts yet.
- An arrêt maladie is the only thing that blocks planning a person that day.

**Planning**
- A person cannot have two shifts overlapping in time, nor two posts in the
  same service (AM / PM) on the same day, across all their restaurants. A
  midi + soir coupure is fine. Two different people may share a post.
- Alerts warn and never block: fewer than two consecutive rest days, more
  than 46 hours a week (confirmed), less than 11 hours between two days (not
  validated for HCR), a shift on an absence day.
- Staffing needs per restaurant, weekday and service; missing posts warn,
  including before publishing, and never block.
- Kitchen and salle are published separately per week. Employees see a shift
  only once its department is published. Head chef publishes the kitchen;
  site director either.
- Day locks: grey open, blue locked (site director), red payslip (HR). A
  locked day refuses changes to shifts, absences and validated hours.

**Leave**
- Earliest start: the Monday after the current week.
- Salle staff → site director. Kitchen staff (every post held is a kitchen
  post) → head chef. Head chef's own → site director. Site director's own →
  multi-site manager only. Multi-site manager's own → operations team.
  Operations team, office and lab → HR.
- Site director and multi-site manager see all requests of their restaurants.
- A problem in the current week is not a leave request and a shift cannot be
  cancelled in the app: the shift shows the phone number of the manager of
  that service (the person planned on a post flagged `isServiceLead`), or
  failing that the site director.

**Access** — everyone sees the planning; levels differ in what they change.
The full table is in workflows.md section 4.

---

## 7. What is built, what is not

**Built and exercised in a browser:** login and password links by e-mail;
accounts, roles and employee records; planning (week by employee, week by
post, month) with drag to move / duplicate / delete, time pickers, notes,
alerts, needs, popular shifts, publication, day locks; tablet clocking;
Badgeuse with editable paid hours and validation; leave requests end to end;
in-app notifications; Mon espace (phone-first).

**Not built** (complete list in workflows.md section 15). The ones that matter soonest:
- Deployment on the VPS, HTTPS, backups. Nothing started.
- Real e-mail (only the fake mailbox is configured).
- Import of employees from a file or PayFit; removing an employee; contract history.
- Posts per restaurant (one company-wide list today).
- Tablet offline mode. Push notifications. Shift swaps. Leave balances.
- The "Rapport" for the multi-site director and all exports.
- Everything in the HR payroll process (section 8).
- AM / PM time windows per site; the service does not follow the hours.

---

## 8. The HR payroll process (given once, not saved as a file)

The owner pasted a specification built from two interviews with the payroll
owner (15 Nov 2026) and was asked to save it under `docs/reference/`. Check
whether they did. If not, this summary is all there is.

- **Pay period**: a configurable range, roughly the 15th to the 15th, ending
  on a Sunday, different every month. Never derive it from the calendar month.
- **Timeline**: Slack announcement to directors on the Wednesday before the
  period ends; badge corrections in two passes (complete weeks, then the last
  week on the Monday after); planning checks; payroll variables sent Tuesday
  or Wednesday; payslip verification; extras payroll; after-sales corrections.
- **Badge rules**: match section 6, except the two points the owner overruled
  (late clock-out counts in full; break only above a shift length).
- **NPT / NTT** in a manager's note means "ne pas toucher": keep the
  manager's selection and never flag it. Not built.
- **End-of-period anomaly report**: one line per discrepancy with planned,
  badged, currently selected, should-be, rule, delta, and whether the error
  favours the employee or the company; a summary per site. Not built.
- **Director scoring** on how well badges were corrected. Formula undefined.
- **Planning checks**: two consecutive rest days, 46 hours, contract against
  worked hours, negative hours (false positive on public-holiday recovery),
  roster hygiene. The first two are the alerts already built.
- **Payroll variables** per site and period: mutuelle, transport, meals,
  overtime, bonuses, expenses, safety shoes (once a year), entries / exits /
  transfers, absences, notes, a check status going white → green.
- **Extras**: paid per shift, processed separately, exported to a sheet.
- **Payslip verification**: about 250 payslips a month against the variables.
- **SAV paie**: a ticket log for corrections after payment.
- Payroll software: Silae through an accounting firm until now, PayFit being
  introduced. PayFit's public API lists create / read for employees,
  contracts and absences, but nothing to send worked hours or variables.

---

## 9. The pilot and its blockers

Decided: planning only, one restaurant, Skello in parallel. The owner sent
their supervisor a status message and had meetings planned with "Théo" (a
demo) and "Agathe" (HR, to go deeper). The lab is run by "Andrej" and is out
of scope for now. Ask the owner what came out of those meetings.

Blockers, in order:

1. **Which restaurant.** Owner's decision.
2. **Its real staff.** Can now be typed in by an administrator, one at a
   time. An import would be needed beyond a pilot.
3. **Installation on the VPS.** Needs server access and a domain name.
   Docker Compose and Caddy were the intended tools; nothing exists in `infra/`.
4. **Real e-mail.** Three settings (`SMTP_URL`, `MAIL_FROM`, `APP_URL`); needs
   the provider's details. Ask them to put the SMTP password in `.env`
   themselves, not in chat.
5. **That restaurant's posts.** Gros Bao Paris uses posts not in the list
   (Wok 1, Wok 2, Garde manger 1 and 2, Kitchen Prep). Decide: per-restaurant
   post lists, or one longer shared list.

---

## 10. Questions still open with the owner

Grouped by what they block. All are in the spec with status Open or Proposed.

**Asked and not answered**
- Who sets staffing needs: director and multi-site only, or the head chef for the kitchen?
- Popular shifts: automatic only, or also saved by hand?
- Which leave types besides congé payé count in the weekly counter?
- Which leave types are exempt from the next-week rule (naissance, paternité)?
- Should the service (AM / PM) follow the start time, and from which hour?
- Should the Badgeuse use the time picker (it still uses typed fields)?
- HR's rights: they kept the ability to enter absences, set the payslip lock
  and decide office leave, but the owner later called HR "an overview".
- Who holds the administrator role in the company.
- Is the 11-hour rest alert right for HCR, and which other HCR limits should alert?
- Does the 12:00 / 19:00 rule cover a range or only those exact times?

**Requested, waiting for details**
- The Rapport for the multi-site director: content of the collapsed columns,
  what the "compteur" adds up, which period, which exports.
- "Formation, visite médicale, ajouter des fichiers": as absence types? Files
  attached to what, and who may see them?
- Profile tabs from a Skello screenshot: Informations personnelles, Dossier
  RH, Mes documents, Notifications, Synchroniser le calendrier. Only password
  and phone exist. The owner said not to guess their content.
- The Skello Badgeuse's "Employés" and "Historique" tabs and its "Position",
  "Abs." and "Actions" columns.

**Unconfirmed readings of data**
- Which of the 66 absence types are active (21 were read as active from
  screenshots of toggles), and whether bereavement leaves are really off.

---

## 11. Known weaknesses

- No permanent tests on the screens or the API endpoints; only the rules
  package and the rights are covered (84 tests).
- The bell polls once a minute. Nothing reaches a phone that is not on the app.
- The tablet needs a connection; the event API is idempotent and ready for an
  offline queue, but none exists.
- A shift's AM / PM is set by hand and drives its colour and coupure logic.
- Editing an employee overwrites the current contract; no history.
- The planning's dense layout was tuned for 1500 × 900. On a 768-pixel-high
  laptop about eight coupure rows fit, not ten.
- Popular shifts and the missing-post check are recomputed on every load.
- `docs/screenshots/` are illustrations from demo data and go stale quickly.
- Not a single part has been run by a real user in a real restaurant.
