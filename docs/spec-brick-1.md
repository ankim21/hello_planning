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

Accounts and roles are managed from the Comptes screen by administrators.
Open: who, in the company, should hold the administrator role.

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
| PLN-3 | All alerts warn only and never block publication. Double-booking a person is not an alert: it is refused (PLN-37) | Confirmed |
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
| PLN-28 | While a shift is dragged over another cell, the cell splits in two, "Déplacer" and "Dupliquer"; dropping on one half does that (as in Skello). Works to another day, another employee, or another post in the view by post | Confirmed |
| PLN-42 | Dragging a shift out of the planning and dropping it deletes it | Confirmed |
| PLN-43 | After such a deletion, an "Annuler la suppression" button stays for 8 seconds and puts the shift back | Proposed |
| PLN-40 | In the shift and absence editor, hours are chosen from lists (hours, then minutes by five), always on 24 hours, not typed | Confirmed |
| PLN-44 | Shift cards show their duration as decimal hours (7.17h, 5.5h), so a row can be added up; totals and counters stay in hours and minutes | Confirmed for the cards; the totals are Proposed |
| PLN-45 | Publication is one drop-down menu whose colour gives the state (orange: nothing published, blue: one department, green: both). Each department is a blue "Publier" button that becomes a grey "publiée" box | Confirmed |
| PLN-46 | A "Dépublier" link stays next to a published department | Proposed |
| PLN-47 | The week planning is dense: at 100% on a 1500 × 900 screen, ten employee rows are visible even when each has a coupure (site director's feedback, 2026-11-17) | Confirmed |
| PLN-48 | The "+" to add a shift is a small button on the top-left corner of the day, shown when the cell is hovered; no "+" row under the shifts | Confirmed |
| PLN-49 | Alerts show their list at once on hover, for an employee and for the week; a click keeps the list open | Confirmed |
| UI-7 | The tabs (Planning, Badgeuse, Demandes, Comptes) sit on the left, right after the restaurant menu; the bell and Mon espace are on the right | Confirmed |
| UI-8 | No side margins on the planning and Badgeuse screens | Confirmed |
| UI-11 | An account button at the top right of every screen opens a menu: who is logged in, Mon profil, "Se connecter avec un autre compte" and "Se déconnecter" | Confirmed 2026-11-17 |
| UI-9 | Every screen works at phone (390 px) and tablet (820 and 1180 px) widths: nothing overflows the screen, touch targets are at least 30 px, the header takes two rows on a phone | Checked 2026-11-17 in an emulated browser, not on real devices |
| UI-10 | On touch screens the corner "+" is hidden; tapping the empty part of a day adds a shift. Dragging shifts is mouse-only | Proposed |
| PLN-41 | A shift with a note shows a small mark on its card, and the note appears when hovering the card | Confirmed |
| PLN-37 | A shift is refused when the person already has one during those hours, whether it is added by hand, edited or duplicated by dragging, and across every restaurant they work at | Confirmed |
| PLN-38 | Superseded by PLN-56: a person cannot have two shifts in the same service on the same day, whatever the posts | Confirmed |
| PLN-39 | Two different people may hold the same post in the same service | Confirmed |
| PLN-29 | Drag-to-duplicate works with a mouse; touch screens are not needed | Confirmed |
| PLN-25 | Whether an absence adds hours to the weekly counter depends on its type | Confirmed |
| PLN-26 | A whole day of absence (repos, congé payé…) is worth a fifth of the weekly contract: 7h on 35 hours, 7.8h on 39; a half day is half of it. This is because everyone earns 2.08 days of paid leave a month whatever their hours | Confirmed 2026-11-17 |
| PLN-50 | The value is shown on the absence card. A day of congé payé adds it to the weekly counter, with at most five days counted per week (a full week of leave = one week of contract) | Confirmed for congé payé; the five-day limit is Proposed |
| PLN-53 | Which other absence types add their value to the counter (RTT, récupération, maternité…) | Open, except récupération JF (PLN-60) |
| PLN-60 | A day of récupération JF counts in the weekly counter like a day of congé payé | Confirmed 2026-11-20 |
| PLN-61 | The planner sets the order of the employee rows by dragging them up or down; the order is the restaurant's | Confirmed 2026-11-20; that it is shared by everyone is Proposed |
| PLN-62 | The employee row shows the contract hours without "/ sem." | Confirmed 2026-11-20 |
| PLN-63 | Popular shifts open from a 🔥 button next to Besoins, as a strip to drag onto an employee's day | Confirmed 2026-11-20; click-then-click for touch screens is Proposed |
| PLN-64 | Today's whole column is highlighted. A day that is past and validated in the Badgeuse closes with the blue lock, and its column is greyed | Confirmed 2026-11-20; "validated" = every line of the day, today included, is Proposed |
| PLN-66 | The hours bar under the planning stays in view while the rows scroll, and each day's total opens its split by post and service | Confirmed 2026-11-20; the split showing people and share is Proposed |
| PLN-67 | A site director takes someone off the planning by asking HR to archive them: the person disappears at once, HR is notified, approval archives the profile, refusal brings them back | Confirmed 2026-11-20 |
| PLN-68 | The request is refused while the person has shifts to come | Confirmed 2026-11-20 |
| PLN-69 | The Total column offers "Compteur": hours over or under the contract over the person's whole time at the restaurant, from planned hours | Confirmed 2026-11-20; starting at the week of the first shift and ending with the week shown is Proposed |
| PLN-70 | The dates of the planning open a calendar to choose a week | Confirmed 2026-11-20 |
| PLN-65 | Each restaurant chooses or creates its own posts for the salle and the kitchen (Petit Bao Bastille salle: Manager and Service); the list is used in Besoins, the shift editor and the Postes view | Confirmed 2026-11-20; set by whoever sets the needs is Proposed |
| PLN-54 | Each restaurant sets its general needs for the week: for each day and service, how many people on each post, and how many in total in the salle and in the kitchen | Confirmed 2026-11-17 |
| PLN-55 | The planning warns, day by day, about posts short of the needs, and again in the publication menu before publishing. It warns; it does not block | Confirmed |
| PLN-56 | A person already on a post in a service (AM or PM) on a day cannot be given another post in that service, at any restaurant | Confirmed 2026-11-17 |
| PLN-57 | Popular shifts: the shifts a restaurant plans most often are offered in the editor as one-click templates | Confirmed |
| PLN-58 | Popular shifts are worked out automatically from the last two months (used at least twice, the twelve most used), not saved by hand | Proposed |
| PLN-59 | Needs are set by the site director or multi-site manager | Proposed |
| PLN-51 | A shift starting at 12:00 or at 19:00 has no break and no meal (0 minutes, 0 meal) | Confirmed 2026-11-17 |
| PLN-52 | PLN-51 applies to those exact start times; the planner can still change the break and meals of a shift | Proposed |
| PLN-10 | Forfait jours managers on the planning | Open |

### 3.4 Time clock (tablet)
| ID | Requirement | Status |
|---|---|---|
| CLK-1 | Clocking happens on a shared tablet on site | Confirmed |
| CLK-2 | The employee identifies with a 4-digit PIN | Confirmed |
| CLK-3 | The tablet lists the names of the site; typing letters of the first or last name narrows the list; the employee taps their name, then enters their PIN (changed 2026-11-20, was "first three letters of the last name") | Confirmed |
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
| HRS-1 | A 20-minute break is deducted automatically on every shift, whatever its length, except a shift starting at 12:00 or 19:00, which has none (PLN-51) | Confirmed |
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
| REQ-9 | Who decides leave (latest version, 17 Nov 2026): salle staff → site director; kitchen staff → head chef; head chef → site director; site director → the multi-site manager only; multi-site manager → the operations team; operations team and office → HR | Confirmed, except the head chef's own request and the lab going to HR (Proposed) |
| REQ-22 | A site director's own leave request is decided by the multi-site manager (reconfirmed 2026-11-16) | Confirmed |
| REQ-21 | The site director and the multi-site manager see every request of their restaurants, as an overview; the head chef sees kitchen requests only; managers see none | Confirmed for the multi-site manager; Proposed for the site director |
| REQ-23 | The multi-site manager is notified each time someone requests leave | Confirmed; today she sees them in Demandes, no push or e-mail yet |
| REQ-24 | Kitchen staff = every post held is a kitchen post; someone who also holds a salle post goes to the site director | Proposed |
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
| NOT-1 | Employees are notified inside their account (see 3.9d); push on the phone was mentioned earlier and is not built | Confirmed |
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
| ME-14 | Leave cannot be requested for the week in progress: the earliest day is the following Monday | Confirmed |
| ME-15 | A shift is not cancelled from the app. For a problem the same day or the same week, the shift shows the contact of the person responsible for that service and tells the employee to call them | Confirmed |
| ME-16 | The person to call is the manager of the service (the employee planned on the Manager post during it), for kitchen staff as well as salle | Confirmed |
| ME-19 | If no manager is planned on that service, the site director is shown instead | Proposed |
| ME-17 | Each employee can enter their own phone number in Profil; it is shown to colleagues only as the contact of a service | Proposed |
| ME-18 | The next-week rule applies to every requestable absence type | Proposed |
| ME-10 | Colleagues' absences are not shown on the personal side | Proposed |
| ME-11 | Employees see a week only once it is published; before that they see nothing of it | Confirmed |
| ME-12 | The profile sub-tabs (Dossier RH, Mes documents, Notifications, Synchroniser le calendrier, Mon mot de passe) | Open |
| ME-13 | Leave balances on the Congés screen | Open (waiting on the counter rules) |

### 3.9b Accounts and roles
| ID | Requirement | Status |
|---|---|---|
| ACC-1 | A screen to create accounts and assign roles | Confirmed |
| ACC-2 | Only administrators of the whole organisation can use it | Proposed |
| ACC-3 | A new account receives an e-mail with a one-time link to choose a password (valid 7 days). The password itself never travels by e-mail | Confirmed (by e-mail); the link rather than a password is Proposed |
| ACC-10 | "Mot de passe oublié" on the login page sends a one-time link valid 1 hour, at most one every five minutes; the answer is the same whether or not the address has an account | Proposed |
| ACC-11 | If no e-mail can be sent, the administrator is shown a temporary password to pass on by hand | Proposed |
| ACC-12 | The e-mail provider to use in production (SMTP address and credentials) | Open |
| ACC-4 | An account can be linked to an employee who has no account yet, or to nobody (office account) | Proposed |
| ACC-5 | Chef, manager, site director and multi-site roles are given on one restaurant; ops, HR and administrator cover the whole organisation | Proposed |
| ACC-6 | An account is deactivated, never deleted; an administrator can reset a password | Proposed |
| ACC-7 | The last active administrator cannot be removed or deactivated, and nobody deactivates their own account | Proposed |
| ACC-8 | Everyone can change their own password (current, new of 10 characters or more, confirmation) | Proposed |
| ACC-9 | From the Comptes screen an administrator creates and edits employee records: name, phone, main restaurant and others, posts, contract type, weekly hours or forfait jours, start date, tablet PIN | Confirmed (asked 2026-11-17); the list of fields is Proposed |
| ACC-13 | An account with nobody behind it can be given an employee record, which gives it Ma semaine, Restaurant and Congés | Confirmed |
| ACC-14 | Employees can exist without an account; they are listed apart, on the planning but unable to log in | Proposed |
| ACC-15 | Editing a record changes the current contract; contract history, deactivating an employee, and import from PayFit or a file | Open |

### 3.9c Planning alerts
| ID | Requirement | Status |
|---|---|---|
| ALR-1 | The planning shows alerts for each employee's week; they warn and never block | Confirmed |
| ALR-2 | Fewer than two consecutive days off in the week | Confirmed (HR payroll checks, P1) |
| ALR-3 | More than 46 hours planned in the week | Confirmed 2026-11-17 |
| ALR-4 | Less than 11 hours of rest between two days | Proposed (labour code); to validate for HCR |
| ALR-5 | A shift planned on a day covered by an absence or a leave | Proposed |
| ALR-6 | Alerts count the person's whole week, in every restaurant they work at | Proposed |
| ALR-7 | Other HCR limits (daily maximum, amplitude, night work, minors), and hours against contract beyond the counter already shown | Open: to be listed and validated by HR |

### 3.9d Notifications
| ID | Requirement | Status |
|---|---|---|
| NTF-1 | Notifications are read inside the application, in the person's account (a bell in the header) | Confirmed |
| NTF-2 | A department's week is published: the employees planned that week in that department | Proposed |
| NTF-3 | A shift is added, changed or removed in a week already published: the employee concerned | Proposed |
| NTF-4 | A leave request is made: the person who decides it, and the site director and multi-site manager | Confirmed for the multi-site manager |
| NTF-5 | A leave request is approved or refused: the employee who asked | Proposed |
| NTF-6 | The person who did the action is not notified of it | Proposed |
| NTF-7 | Notifications outside the application (push on the phone, e-mail) | Not built |

### 3.9e Pilot
| ID | Decision | Status |
|---|---|---|
| PIL-1 | First roll-out: the planning, in one restaurant; no pay | Confirmed |
| PIL-2 | Skello keeps running in parallel in that restaurant during the pilot | Confirmed |

### 3.9f Building a planning faster
| ID | Requirement | Status |
|---|---|---|
| FAST-1 | Fill a gap in one click: a missing post opens a list of the people who could take it, best choice first, and one click plans the shift | Confirmed 2026-11-17 |
| FAST-2 | A person qualifies when they work at the site, hold the post, have no shift in that service, no overlapping hours and no absence that day | Proposed |
| FAST-3 | Ranking: people the shift would cause no new alert for come first, then those with the most hours left on their contract that week | Proposed |
| FAST-4 | The shift created uses the restaurant's most frequent hours for that post and service; failing that, for that service; failing that, 10:00–15:00 or 18:00–23:00 | Proposed |
| FAST-5 | A department total ("Salle — total") cannot be filled this way, since it names no post | Proposed |
| FAST-6 | A fairness rule for suggestions (weekends, closing shifts) | Open |
| FAST-7 | Proposing a whole planning from the needs; rotations; availability given by employees; demand forecast from sales | Discussed, not built |
| ACC-16 | A multi-site manager's role is given on several restaurants in one step | Confirmed 2026-11-17 |

### 3.10 Differences with the HR payroll spec (interviews of 15 Nov 2026)

The HR document describes the same badge rules as section 5.2 of the
architecture, with four differences. The code follows the owner's earlier
answers until these are settled, because each one changes pay.

| ID | Subject | Built today (owner's answers) | HR document | Status |
|---|---|---|---|---|
| HR-1 | Clock-out 11 minutes or more after the planned end | Only the minutes beyond the 10th count (14 late = 4, 16 late = 6) | The whole overrun counts (23:16 = 23:16) | Settled 2026-11-17: the built rule stands; the HR document is to be corrected |
| HR-2 | Late clock-out on a coupure | Not counted before the break; at the end of the day the usual 10-minute tolerance applies | Same for the end before the break; the end of the day was an open question there | Settled 2026-11-17, code changed: the end of the evening service now counts past the 10th minute |
| HR-3 | 20-minute break | Deducted from every shift, 40 minutes on a coupure | Required above a shift length, assumed 6 hours (OPEN-Q2) | Settled 2026-11-17: the built rule stands; the HR document is to be corrected |
| HR-4 | Manager note NPT / NTT ("ne pas toucher") | Not built | Keeps the manager's selection and is never flagged | Open |

Also in the HR document and not built: pay periods that end on a Sunday
(about the 15th to the 15th), the end-of-period anomaly report with
"favours employee / company", director scoring, the planning checks (two
consecutive rest days, 46 hours a week, hours against contract, negative
hours, roster hygiene), payroll variables, extras, payslip checks and SAV paie.

### 3.11 Requested on 2026-11-17, waiting for details
| ID | Requirement | Status |
|---|---|---|
| RPT-1 | A "Rapport" for the multi-site director: per employee, hours counter at the start of the period, hours per week, counter at the end, with exports | Open: counter rules and the content of the collapsed columns are unknown |
| PLN-35 | "Formation" and "Visite médicale" on the planning | Open: as absence types, or as something else |
| PLN-36 | Adding files | Open: to what, which files, who may see them |

## 4. What would close most of the open items

1. Screenshots of the Skello screens used today: the weekly planning, the
   clocking correction page, the leave request form, the alert list.
2. A site director walking through one real week: building it, publishing it,
   correcting the clockings.
3. The list of posts.
