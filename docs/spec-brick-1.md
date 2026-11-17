# Brick 1 — Planning and time clock: functional spec (draft 1)

Status: draft, 2026-11-16. Companion to [architecture.md](architecture.md).

Each requirement is tagged:
- **Confirmed** — stated by the company.
- **Proposed** — a design choice not yet confirmed; change it freely.
- **Open** — cannot be written until a question is answered.

## 1. Scope

**In:** sites and legal entities, employee accounts, weekly planning, publication,
time clock on a shared tablet, weekly correction and validation of hours, leave
requests, shift-swap requests, notifications to employees.

**Out (later bricks):** HR administration (contracts, documents, onboarding),
payroll export, labour-cost and social analysis, forfait jours follow-up.

## 2. Access

The rule, as given on 2026-11-16: everyone can see the planning; the only
difference between people is what they can change.

| Who | Scope | Sees | Can change | Status |
|---|---|---|---|---|
| Employee (everybody else) | The sites they work at | Planning (a colleague's absence shows as "Absent", without its type); own leave requests | Nothing on the planning; makes leave requests | Confirmed, except the hidden absence type (Proposed) |
| Head chef | One site | Planning | Kitchen shifts; absences | Confirmed (kept apart from manager) |
| Manager | One site | Planning, Badgeuse | Validates clockings | Confirmed (kept apart from head chef) |
| Site director | One site | Everything on the site | Planning, absences, day lock, Badgeuse, decides leave requests | Confirmed |
| Multi-site manager | Each of her sites | Everything on her sites | Everything a site director can, on each of her sites; decides her directors' own leave requests | Confirmed |
| Operations team (office) | All sites | Planning and Badgeuse of the whole organisation | Nothing | Confirmed (overview); Badgeuse included is Proposed |
| HR team | All sites | Planning and Badgeuse of the whole organisation | Absences, red payslip lock, leave requests of office and lab staff | Overview confirmed; the changes come from earlier answers, to reconfirm |
| Administrator | All sites | Everything | Everything, plus tablets, PINs and posts | Proposed |

Open: who administers tablets, PINs and posts.

The office has no planning and no time clock in brick 1, only absence requests.
The lab is left out of brick 1.

## 3. Requirements

### 3.1 Organisation and employees
| ID | Requirement | Status |
|---|---|---|
| ORG-1 | 13 legal entities, each with one site (11 restaurants, lab, office) | Confirmed |
| ORG-2 | An employee can hold several posts and work on several sites | Confirmed |
| ORG-3 | Employees and contracts come from PayFit, not typed in twice | Confirmed |
| ORG-4 | Contract weekly hours are 39h, 35h or 25h; forfait jours for senior management | Confirmed |
| ORG-5 | Kitchen posts: Pass, Master Wok, Bao Master, Bao Cook, Plonge (all AM and PM, Pass included) | Confirmed |
| ORG-7 | Front-of-house (salle) posts: Manager, Chef de rang, Bar, Runner | Confirmed |
| ORG-8 | Every post exists as AM and as PM | Confirmed |
| ORG-9 | An administrator can add posts | Confirmed |
| ORG-10 | A post is stored once with its department; AM / PM is the service chosen on the shift, so a new post gets both automatically | Proposed |
| ORG-12 | AM and PM follow fixed time windows (for example 10:00–15:00, 11:00–16:00), defined per site as a setting; exact windows to come. A planner can deviate from the window on a given shift | Confirmed |
| ORG-13 | A coupure is one AM shift plus one PM shift on the same day | Confirmed |
| ORG-14 | Head chefs and site directors can be planned on any post | Confirmed |
| ORG-11 | Posts (stations) are separate from roles (rights): the post "Manager" does not by itself grant the manager role | Proposed |
| ORG-6 | PayFit sync runs on a schedule; pushed updates only if PayFit's webhooks allow it | Proposed |

### 3.2 Login
| ID | Requirement | Status |
|---|---|---|
| AUTH-1 | Login by email (personal or baofamily.co) and password | Confirmed |
| AUTH-2 | Password reset by email | Proposed |
| AUTH-3 | Each tablet is registered to one site by an administrator and stays logged in | Proposed |

### 3.3 Planning
| ID | Requirement | Status |
|---|---|---|
| PLN-1 | The site director builds the restaurant planning; the head chef (or pass master) builds the kitchen planning | Confirmed |
| PLN-11 | Each post belongs to a department (kitchen or front of house); planning rights are granted per department | Proposed |
| PLN-12 | Kitchen and salle are published separately, week by week. The head chef publishes the kitchen; the site director (or multi-site manager) publishes either or both | Confirmed |
| PLN-34 | An employee sees a shift once its department is published for that week; a week with one department published shows as "Partiellement publié" | Confirmed |
| PLN-32 | A published week shows changes made afterwards immediately; it can be unpublished | Proposed |
| PLN-33 | Telling employees that a week was published or changed (push notification) | Open |
| PLN-2 | Alerts follow IDCC 1979 (HCR); exact list to come | Open |
| PLN-3 | All alerts warn only and never block publication | Confirmed |
| PLN-4 | An employee cannot be planned during an arrêt maladie; this blocks | Confirmed |
| PLN-5 | A shift carries an employee, a post, a start, an end; a coupure is two services on the same day | Proposed |
| PLN-6 | Publishing makes the week visible to employees and notifies them; later changes notify only those affected | Proposed |
| PLN-7 | Running total of planned hours per employee against contract hours | Proposed |
| PLN-8 | Copy a previous week or apply a template | Open |
| PLN-9 | Week view: one row per employee, one column per day (Monday to Sunday), shifts and absences as cards in the cells | Confirmed |
| PLN-13 | Cards are colour-coded by post; absences have their own colour | Confirmed |
| PLN-14 | Each day has a lock: grey = open, blue = locked, red = being counted for payslips | Confirmed |
| PLN-15 | Each employee row shows a weekly counter: planned hours against contract hours, with the difference | Confirmed |
| PLN-16 | Each day shows a recap: number of people and total hours | Confirmed |
| PLN-17 | Clicking a card opens a window with two tabs, Shift and Absence | Confirmed |
| PLN-18 | Shift tab: start, end, break in minutes (20 by default), resulting duration, post, meals taken, note | Confirmed |
| PLN-19 | Absence tab: absence type, whole day / half day / custom hours, note | Confirmed |
| PLN-20 | A locked day cannot be edited. Site directors lock and unlock; only HR sets or lifts the payslip lock | Proposed |
| PLN-21 | Colour is set per post; AM is shown in a light tint and PM in a strong tint of it | Proposed |
| PLN-22 | Tasks and attached files on a shift (present in Skello) | Open |
| PLN-23 | "Non assignés" row for shifts without an employee (present in Skello) | Open |
| PLN-24 | Day view (present in Skello) | Open |
| PLN-30 | Month view: one column per day of the month, compact cards, hours and number of shifts per employee | Confirmed |
| PLN-31 | The editor's title names the employee ("Modifier le shift de …") above the Shift / Absence tabs, on the post's colour | Confirmed |
| UI-1 | The application is called PLANetBAO, with a space-themed logo | Confirmed |
| UI-2 | Header: a menu to switch site (site name only, no legal entity), then the tabs Planning, Badgeuse, Mon profil | Confirmed |
| UI-3 | The interface is in French | Confirmed |
| UI-4 | The month view covers a calendar month | Confirmed |
| UI-5 | Times are typed in 24-hour format (16:30), whatever the language of the computer | Proposed |
| PLN-27 | A second view of the week by post: one row per post and service, cards showing the employee, a recap per cell (people and hours) and a total per row | Confirmed |
| PLN-28 | Dragging a shift onto another cell duplicates it there (other day, other employee, or other post in the view by post) | Confirmed |
| PLN-29 | Drag-to-duplicate works with a mouse; touch screens are not needed | Confirmed |
| PLN-25 | Whether an absence adds hours to the weekly counter depends on its type | Confirmed |
| PLN-26 | Which absence types count, and how many hours a whole day and a half day are worth | Open |
| PLN-10 | Forfait jours managers on the planning | Open |

### 3.4 Time clock (tablet)
| ID | Requirement | Status |
|---|---|---|
| CLK-1 | Clocking happens on a shared tablet on site | Confirmed |
| CLK-2 | The employee identifies with a 4-digit PIN | Confirmed |
| CLK-3 | The employee types the first three letters of their last name, selects themselves, then enters their PIN | Confirmed |
| CLK-4 | Clock in, clock out; breaks can be clocked | Confirmed |
| CLK-5 | Clock-in without a planned shift is accepted and flagged to the manager | Confirmed |
| CLK-6 | Forfait jours managers do not clock | Confirmed |
| CLK-7 | The tablet keeps working without internet and synchronises later | Confirmed |
| CLK-8 | Clock events are never modified or deleted | Proposed |

### 3.5 Hours calculation
The rules are in [architecture.md, section 5.2](architecture.md). All are confirmed
except:

| ID | Requirement | Status |
|---|---|---|
| HRS-1 | A 20-minute break is deducted automatically on every shift, whatever its length | Confirmed |
| HRS-4 | On a coupure the break is deducted from each of the two shifts: 40 minutes for the day | Confirmed |
| HRS-2 | Forgotten clock-out on an unplanned shift: entry stays open and flagged | Proposed |
| HRS-3 | When a break is both clocked and automatic, which one applies | Open |

### 3.6 Correction and validation
| ID | Requirement | Status |
|---|---|---|
| VAL-1 | The site director checks and corrects clockings at least once a week | Confirmed |
| VAL-2 | The correction page shows planned against clocked, with warnings for unplanned clock-ins and forgotten clock-outs | Confirmed |
| VAL-3 | The validator can overrule the automatic rules (for example count a late clock-out) | Confirmed |
| VAL-4 | Every correction records who and when; the note explaining why is optional, as in the Skello screen | Proposed |
| VAL-11 | Badgeuse layout: the week's days on the left with a tick when the day is fully validated; one line per planned shift (plus clockings without a shift); columns planned, clocked, paid (editable start, end, break), meals, total, note; "Valider la journée" | Confirmed |
| VAL-12 | A coloured time shows which planned or clocked time the paid hours use: green start, violet end, orange break | Proposed |
| VAL-13 | A sub-tab lists the absences planned that day | Confirmed |
| VAL-14 | The tabs "Employés" and "Historique", and the columns "Position", "Abs." and "Actions" of the Skello screen | Open |
| VAL-7 | "Valider" accepts the computed hours; "Tout valider" does it for the whole day; a validation can be undone | Proposed |
| VAL-8 | Hours can be added by hand, with a reason, for a planned shift that was not clocked | Proposed |
| VAL-9 | Managers and site directors validate clockings, kitchen included; head chefs do not | Confirmed |
| VAL-10 | A locked day refuses any change to validated hours | Proposed |
| VAL-5 | A reminder when a week has not been validated | Proposed |
| VAL-6 | The employee sees their validated hours | Proposed |

### 3.7 Leave and shift-swap requests
| ID | Requirement | Status |
|---|---|---|
| REQ-1 | Employees submit leave requests and shift-swap requests | Confirmed |
| REQ-2 | Requests are visible to the employee and to the planner | Confirmed |
| REQ-3 | Deciders as in section 2 | Confirmed |
| REQ-9 | Leave requests of restaurant staff, kitchen included, are decided by the site director only. No first approval by the head chef (corrected 2026-11-16) | Confirmed |
| REQ-22 | A site director's own leave request is decided by the multi-site manager (reconfirmed 2026-11-16) | Confirmed |
| REQ-21 | Only the people who decide see the requests and the Demandes tab; head chefs and managers do not | Confirmed |
| REQ-4 | An approved leave appears on the planning as an absence | Proposed |
| REQ-13 | A request still waiting appears on the planning as a dashed card | Proposed |
| REQ-16 | Lab staff requests go to HR, like the office | Proposed |
| REQ-17 | The request goes to the managers of the employee's main site | Proposed |
| REQ-18 | Nobody decides their own request | Proposed |
| REQ-19 | The approver is told how many shifts are already planned over the period; this does not block | Proposed |
| REQ-20 | The employee can withdraw a request until it is decided; after approval only a manager can remove the absence | Proposed |
| UI-6 | A fourth tab, Demandes, for people with a role; an employee's own requests are in Mon profil | Proposed |
| REQ-5 | An approved swap moves the shift to the other employee and re-runs the alerts | Proposed |
| REQ-6 | Absence types and which ones an employee can request: see [reference/absence-types.md](reference/absence-types.md) (transcription in progress) | Partly open |
| REQ-10 | Brick 1 keeps counters (balances) for absences, not only the record | Confirmed |
| REQ-12 | Which counters, their unit, how each is earned and spent, and where the opening balances come from | Open |
| REQ-11 | Absences an employee cannot request (arrêt maladie, accident du travail, absence injustifiée…) are entered by HR | Confirmed |
| REQ-7 | Whether the other employee must accept a swap before the approver sees it | Open |
| REQ-8 | Whether approved leave is sent to PayFit (its API accepts validated absences) | Open |

### 3.8 Notifications
| ID | Requirement | Status |
|---|---|---|
| NOT-1 | Employees are notified by push and inside their account | Confirmed |
| NOT-2 | Events notified: planning published, shift changed, request decided | Proposed |
| NOT-3 | Web app (PWA) with push notifications | Confirmed |

### 3.9 Mon espace (the employee's own side)
| ID | Requirement | Status |
|---|---|---|
| ME-1 | Two spaces behind one login: Mon espace (personal) for everyone who works shifts, Gestion for people with a role, with a switch between them | Proposed |
| ME-2 | The personal side is not for clocking: it shows one's planning, lets one ask for leave, and shows who one works with | Confirmed |
| ME-3 | Ma semaine: all of one's activity for the week, across every restaurant, with post and hours | Confirmed |
| ME-4 | Each shift shows the colleagues working at the same restaurant during the same hours | Confirmed |
| ME-5 | The next shift is shown first, before the week | Proposed |
| ME-6 | Restaurant: the planning of one of one's restaurants for the week, read one day at a time (service, then salle and cuisine) | Confirmed (the view); the day-by-day layout is Proposed |
| ME-7 | Profil organises the information by restaurant: one card per restaurant worked at, the main one first | Confirmed |
| ME-8 | An employee has a list of restaurants and one main restaurant | Confirmed |
| ME-9 | Congés: ask for days off and follow the answer | Confirmed |
| ME-10 | Colleagues' absences are not shown on the personal side | Proposed |
| ME-11 | Employees see a week only once it is published; before that they see nothing of it | Confirmed |
| ME-12 | The profile sub-tabs (Dossier RH, Mes documents, Notifications, Synchroniser le calendrier, Mon mot de passe) | Open |
| ME-13 | Leave balances on the Congés screen | Open (waiting on the counter rules) |

## 4. What would close most of the open items

1. Screenshots of the Skello screens used today: the weekly planning, the
   clocking correction page, the leave request form, the alert list.
2. A site director walking through one real week: building it, publishing it,
   correcting the clockings.
3. The list of posts.
