# Skellobis — Architecture (draft 1)

Status: draft, 2026-11-16. Covers the overall shape of the system and brick 1
(planning + time clock). Anything not confirmed by the company is listed in
section 8 as an open question, not designed around an assumption.

## 1. Confirmed context

| Topic | Confirmed |
|---|---|
| Goal | Replace Skello with an in-house application, as part of internalising all SaaS |
| Scale | ~250 employees, 11 restaurants + 1 lab + 1 office (13 sites) |
| Contract types | CDI, CDD, extras, apprentices, part-time |
| Legal entities | 13 (see 5.1) |
| Collective agreement | IDCC 1979 — Hôtels, Cafés, Restaurants |
| Contracts (hours) | 39h, 35h, 25h; forfait jours for senior management |
| Payroll | PayFit, operated by an accounting firm; connection wanted, details to come |
| Employee data source | PayFit (API). No connection to Skello |
| Time clock device | Shared tablet on site |
| Multi-post, multi-site | An employee can hold several posts and work on several sites |
| Brick 1 scope | Planning, time clock, leave requests, shift-swap requests. Labour cost lives in a separate analysis area |
| Users | Operations, HR, Finance; permissions defined brick by brick |
| Hosting | VPS, maintained by the owner |
| Clients | Web and mobile |
| Login | Email address |
| Compliance | GDPR (France) |
| First brick | Site manager builds the planning; employee clocks in and out |
| Later bricks | HR administration, finance reporting (cost by post and seniority, social KPIs) |

## 2. Stack

The proposed stack (React + NestJS + Prisma + PostgreSQL, all TypeScript) fits
this application and is kept. Nothing more exotic is justified: the hard part
here is business rules, not technology, and the owner must be able to maintain it.

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language to maintain; types shared between front and back |
| API | NestJS 12, REST | Its module system maps one-to-one to the bricks below |
| Database | PostgreSQL 17 + Prisma 7 | Relational data, strong constraints, transactions |
| Web + mobile | React (Vite), delivered as a PWA | One codebase for desktop, phone and tablet kiosk |
| Validation | Zod schemas in a shared package | Same rules checked in the browser and the API |
| Background jobs | pg-boss (queue stored in PostgreSQL) | No extra server to run on the VPS |
| Deployment | Docker Compose + Caddy (HTTPS) | Reproducible, simple to operate on one VPS |
| Repo | npm workspaces monorepo | Apps and shared packages versioned together; no extra tool to install |

Native mobile apps (React Native) are deliberately not in draft 1. They become
necessary only if a confirmed requirement cannot be met by a PWA (see 8.1).

## 3. System shape: modular monolith

One API, one database, strict internal modules. Each module owns its tables and
exposes a service; other modules never query its tables directly. This gives the
clarity of separate services without the operational cost.

```
            ┌───────────────────────── React PWA ─────────────────────────┐
            │  Manager: planning   Employee: my shifts   Kiosk: time clock │
            └───────────────────────────────┬─────────────────────────────┘
                                            │ REST (HTTPS)
┌───────────────────────────────── NestJS API ─────────────────────────────────┐
│  auth ── access (roles × site scope)                                          │
│                                                                               │
│  org            people           planning          timeclock                  │
│  entities,      employee,        weeks, shifts,    clock events,              │
│  sites, posts   contract (min.)  publication       time entries, validation   │
│                                                                               │
│  labor-rules (pure TypeScript, no database)   notifications   audit           │
│  integrations: payfit (employees, contracts, absences)                        │
│  later bricks: hr-admin · finance-reporting                                   │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                   PostgreSQL
```

## 4. Design principles

1. **Planned, clocked and validated time are three separate things.** A shift is
   what the manager planned. A clock event is what the employee did. A time entry
   is what the manager validated and what payroll will receive. They are never
   merged or overwritten.
2. **Clock events are append-only.** A correction is a new record with an author
   and a reason; the original is kept. This is what makes hours defensible in a
   dispute or an inspection.
3. **Labour rules live in one isolated package.** `labor-rules` takes shifts and
   contracts and returns alerts. No database, no HTTP, fully unit-tested. The
   planning screen and later the payroll export use the same rules.
4. **Permissions are role × scope from day one.** A grant is "role R on site S"
   (or on all sites). The roles themselves are defined brick by brick; the
   mechanism does not change.
5. **Everything is audited.** Who changed which shift or time entry, when, from
   what to what.
6. **Timestamps stored in UTC, each site carries its timezone.**
7. **Data minimisation.** Brick 1 stores only the employee fields planning needs.
   Salary and HR documents arrive with their own bricks and their own access rules.

## 5. Domain model for brick 1

```
LegalEntity 1─n Site 1─n SitePost n─1 Post
Employee 1─n Contract            (type, weekly hours, start, end, legal entity)
Employee 1─n SiteAssignment      (site, post, primary or secondary)
User 1─1 Employee (optional)     User 1─n RoleGrant (role, site or all)

ScheduleWeek (site, week, status: draft | published, version)
   1─n Shift (employee, post, start, end, break, note)
LeaveRequest (employee, type, start, end, status, decided by)
ShiftSwapRequest (shift, requester, proposed employee, status, decided by)
Absence (employee, type, start, end)              — created from an approved request

ClockEvent  (employee, site, kind: in | out | break-start | break-end,
             server time, device, method)         — append-only
TimeEntry   (employee, site, day, start, end, break, linked shift,
             status: pending | validated, correction author + reason)
AuditLog    (actor, action, entity, before, after, time)
```

### 5.1 Legal entities and sites (as given)

| # | Legal entity | Site |
|---|---|---|
| 1 | Bao Lab | Bao Lab |
| 2 | Bao Express | Petit Bao Bastille |
| 3 | Petit Bao | Petit Bao EM |
| 4 | Gros Bao | Gros Bao Paris |
| 5 | Bao Bar | Bleu Bao |
| 6 | Gros Bao Marseille | Gros Bao Marseille |
| 7 | Street Bangkok Odeon | Petit Bao Saint Germain |
| 8 | Street Bangkok Pigalle | Petit Bao Pigalle |
| 9 | Petit Bao Ternes | Petit Bao Ternes |
| 10 | Petit Bao FSD | Petit Bao FSD |
| 11 | Petit Bao Bercy | Petit Bao Bercy |
| 12 | Street Bangkok EM | Street Bangkok Etienne Marcel |
| 13 | Bao Family | Office |

### 5.2 Clocking rules (as given)

| Situation | Counted time |
|---|---|
| Clock-in before the planned start | Starts at the planned start; no extra minutes |
| Clock-in after the planned start | Starts at the actual clock-in |
| Clock-out before the planned end | Ends at the actual clock-out |
| Clock-out up to 10 minutes after the planned end | Ends at the planned end |
| Clock-out from the 11th minute after the planned end | Only minutes beyond the 10th count (14 minutes late = 4), unless the validator decides otherwise |
| Employee on a coupure (split shift) | Late clock-out never counted, at the end of either service |
| Forgotten clock-out | Set to the planned end and flagged for the weekly check |
| Clock-in with no planned shift | Recorded, with a warning on the manager's correction page |
| Breaks | 20 minutes deducted automatically on every shift, whatever its length (so 40 minutes on a coupure); can also be clocked |
| Forfait jours managers | Outside the time clock |

Identification on the tablet is by PIN.

Corrections and validation are done by the site manager or director, at least
once a week. These rules are applied when a time entry is computed from clock
events; the raw clock events are kept unchanged.

### 5.4 Access, approvals and alerts (as given)

- Login: email (personal or baofamily.co) and password.
- Tablet: the employee types the first three letters of their last name, picks
  themselves, then enters their PIN. The tablet keeps working offline and
  synchronises when the connection returns.
- Mobile: web app (PWA) with push notifications, plus notifications in the account.
- Planning alerts: all warn only. Nothing blocks publication except an arrêt
  maladie. The alert list is to come as a screenshot.
- Planning is built by the site director for the restaurant and by the head chef
  (or pass master) for the kitchen. The lab is left out for now. The office has
  no planning, only absence requests.
- Leave and shift-swap requests, restaurant staff: decided by the site director.
- Leave and shift-swap requests, kitchen staff: the head chef can give a first
  approval; the final decision is the site director's.
- Leave requests of site directors: decided by the multi-site manager.
- Leave requests of office staff: decided by the HR team only.
- Clocking corrections, kitchen included: site director, or the manager below them.
- Roles: employee, head chef, manager, site director, multi-site manager,
  operations team, HR, administrator. Everyone sees the planning; rights differ
  only in what can be changed (spec, section 2).

Consequence for the model: a site has departments (kitchen, front of house).
Each post belongs to one, and planning rights and the first approval step are
granted per department. This is a proposal that follows from the above.

### 5.3 PayFit integration (checked against PayFit's public documentation)

PayFit's API index lists: list / get / create collaborator, list / get contracts,
create contract (France), list absences, create a validated absence, cancel an
absence, and read-only worked time. Customers connect with an API key.

Not listed: updating a collaborator or contract, and sending worked hours or
payroll variables into PayFit. The webhook page exists but its events were not
readable, so "an employee created in PayFit appears here automatically" is
unconfirmed; the fallback is a scheduled sync. Hours for payroll will therefore
most likely leave this application as an export file, to be agreed with the
accounting firm.

## 6. Brick 1 workflows

**Site manager (responsable de site)**
1. Opens the week for their site; sees employees, contracts hours, absences.
2. Creates shifts (by hand, or from a template / previous week).
3. Sees rule alerts and hour totals per employee while editing.
4. Publishes the week; employees are notified. Later edits create a new version
   and notify only the employees affected.
5. Each day or week: reviews time entries against shifts, corrects anomalies
   with a reason, validates.

**Employee**
1. Logs in, sees their published shifts.
2. Clocks in, takes breaks, clocks out.
3. Sees their own clocked and validated hours.

The exact steps, tolerances and alerts depend on section 8.

## 7. Repository layout

```
apps/api            NestJS, one folder per module in section 3
apps/web            React PWA (manager, employee, kiosk)
packages/shared     Zod schemas and types used by both apps
packages/labor-rules  Working-time rules, pure TypeScript
prisma/             Schema and migrations
infra/              Docker Compose, Caddy, backup scripts
docs/               This document, the spec, decision records
```

## 7b. What is built (2026-11-16)

Built, checked against a running server and clicked through in a browser:
- Database model, with clock events made append-only by a database trigger.
- Seed of the 13 legal entities and sites, the 9 posts with their colours, and
  the 66 absence types (21 active).
- Login by email and password; rights as "role on site", kitchen-limited for head chefs.
- Tablet: registration, name search by first letters, 4-digit PIN, clock in / out / break.
- Hours calculation from the rules in 5.2, and the planned-against-clocked page (read-only).
- Weekly planning: employee rows, day columns, colour-coded shift cards,
  absence cards, weekly counter against the contract, daily recap, day locks
  (grey / blue / red), and the Shift / Absence editor.
- Planning by post (a row per post and service) and drag-to-duplicate of shifts.
- Month view with hours and number of shifts per employee.
- PLANetBAO header: logo, site menu, tabs Planning / Badgeuse / Mon profil. Screens in French.
- Badgeuse: validate, correct with a reason, add hours by hand, undo; every change in the audit log.
- Leave requests: employee form in Mon profil; decided by the site director only (multi-site
  manager for a director's own request, HR for office and lab); Demandes tab for deciders only.
- Mon espace, the personal side (phone first): Ma semaine across all restaurants with
  colleagues, the restaurant's line-up day by day, Congés, Profil by restaurant.
- Publication: kitchen and salle are published separately per week (head chef: kitchen;
  site director: either). Employees see nothing of a department before that.
- Badgeuse by day: one line per planned shift, editable paid hours and meals, validate a line
  or the whole day, week list with a tick per validated day.
- Planning a shift during an arrêt maladie is refused; a locked day cannot be edited.

Not built yet: HCR alerts, shift-swap requests, absence counters,
notifications, offline mode on the tablet, PayFit sync, the employee's own
view, production deployment.

Choices made while building, to confirm:
- Site directors lock and unlock a day; only HR (or an administrator) sets or
  lifts the red payslip lock. A locked day refuses every change.
- Colour is per post: light tint for AM, strong tint for PM.
- The break set on a shift (20 by default) is what the hours calculation deducts.
- Meals taken default to 1 per shift.
- The weekly counter adds up shifts only until the per-type absence rule is given (PLN-26).
- Head chefs, site directors and HR can enter any active absence type on the planning.
- PINs are set by an administrator only.
- A clock-in with no clock-out counts as "still at work" for 16 hours, then as
  a forgotten clock-out. It is only attached to a shift starting within 4 hours.
- Validated hours are stored separately from the clockings; managers and site
  directors validate, and a locked day refuses changes to them.

## 8. Open questions

### 8.1 Still needed for brick 1
- Planning screen: screenshots of the current planning, correction page, leave
  form and alert list, or a walkthrough by a site director.
- Is the week published once per site, or separately for kitchen and front of
  house? Does the site director review the kitchen planning before publication?
- Is "pass master" a role distinct from head chef?
- Manager (below the site director): besides correcting clockings, can they
  build the planning or decide requests?
- When a break is clocked, does the clocked duration replace the automatic 20 minutes?
- HCR rules validated by HR or the accounting firm.
- AM / PM time windows per site (to come); can a shift deviate from its window?
- Absence counters: which ones, units, earning rules, opening balances, and
  whether PayFit or this application is the reference when they differ.

### 8.2 Needed later, not blocking the start
- PayFit: one account or one per legal entity; API key.
- Import of Skello history (past hours, leave balances) by file, or start empty.
- Cutover: pilot site first, or all sites at once.
- Export format expected by the accounting firm.
- Lab: planning and approvals, when it is brought in.
- Labour-cost analysis: which brick; individual salaries or totals for site managers.
- Interface languages; VPS provider, country and size; who signs off brick 1.
