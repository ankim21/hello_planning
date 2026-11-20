# PLANetBAO — What the application does today

Written from the code on 2026-11-17. This document describes every workflow
that exists, the rules each one applies, and what is not built. It describes
the code as it is, not what is planned: for intentions and open questions see
[spec-brick-1.md](spec-brick-1.md), and for how it is built see
[architecture.md](architecture.md).

All data in the running copy is demo data, except the 13 legal entities and
sites, the 9 posts and the 66 absence types.

## Contents

1. [The two spaces](#1-the-two-spaces)
2. [Logging in and passwords](#2-logging-in-and-passwords)
3. [Accounts and roles](#3-accounts-and-roles)
4. [Access levels](#4-access-levels)
5. [Building the planning](#5-building-the-planning)
6. [Publishing a week](#6-publishing-a-week)
7. [Locking a day](#7-locking-a-day)
8. [Clocking on the tablet](#8-clocking-on-the-tablet)
9. [How hours are calculated](#9-how-hours-are-calculated)
10. [Validating hours in the Badgeuse](#10-validating-hours-in-the-badgeuse)
11. [Leave requests](#11-leave-requests)
12. [A problem at the last minute](#12-a-problem-at-the-last-minute)
13. [Mon espace, screen by screen](#13-mon-espace-screen-by-screen)
14. [The audit log](#14-the-audit-log)
15. [What is not built](#15-what-is-not-built)
16. [Reference: screens, server routes, data](#16-reference)

---

## 1. The two spaces

One login opens two separate spaces.

| Space | For whom | Address | Contains |
|---|---|---|---|
| **Mon espace** | Every account linked to an employee | `/moi` | Ma semaine, Restaurant, Congés, Profil |
| **Gestion** | Every account with a role | `/sites/…`, `/demandes`, `/comptes` | Planning, Badgeuse, Demandes, Comptes |

- A plain employee lands on Mon espace and never sees Gestion.
- Someone with a role lands on the planning of the last site they used, and
  has a "Mon espace" button. Mon espace has a "Gestion" button to come back.
- An account with a role but no employee behind it (operations, administrator)
  has only the Profil screen in Mon espace.
- The shared tablet (`/kiosk`) is a third thing: it needs no login, only a
  one-time set-up code.

The interface is in French. On a phone, Mon espace puts its navigation in a
bar at the bottom; on a computer it moves into the header.

---

## 2. Logging in and passwords

**Log in.** E-mail and password at `/login`. A successful login stays valid
for 30 days on that browser. The error message is the same whether the e-mail
or the password is wrong. A deactivated account is refused.

**Forgotten password.** "Mot de passe oublié ?" on the login page asks for an
e-mail address and sends a link valid for 1 hour. At most one e-mail is sent
every five minutes per account. The page shows the same message whether or not
the address has an account.

**Choosing a password from a link.** The link opens a page with two fields
(the password twice, at least 10 characters). The link works once; using it
also cancels any other pending link of that account.

**Changing one's own password.** In Mon espace → Profil: current password, new
password (10 characters or more), confirmation.

**Temporary password.** Only used when an e-mail could not be sent. The person
logs in with it, is sent straight to Profil, and the password form is already
open with a notice.

**Log out.** The round account button at the top right of every screen opens
a menu with the person's name and e-mail, "Mon profil", "Se connecter avec un
autre compte" and "Se déconnecter". Both end the session on that device and
return to the login page. Also available in Mon espace → Profil.

---

## 3. Accounts and roles

Screen: Gestion → **Comptes**. Only for administrators of the whole
organisation.

| Action | What happens |
|---|---|
| Create an account | Enter the login e-mail; optionally link an employee who has no account. The person receives an e-mail with a one-time link (valid 7 days) to choose a password. |
| Link to an employee | Gives the account Mon espace. Left empty, it is an office account. One employee can have only one account. |
| Add a role | Choose the role, then the restaurant when the role is held on one. |
| Remove a role | The × on the role. |
| Send a password link | E-mails a new one-time link. The current password keeps working until the link is used. |
| Deactivate / reactivate | A deactivated account cannot log in. Nothing is deleted. |
| Search | By name or e-mail. |

Rules:
- Chef de cuisine, Manager and Responsable de site are given **on one
  restaurant**. Responsable multisite is given on several at once, by ticking
  her restaurants.
- Équipe opérationnelle, Ressources humaines and Administrateur cover **the
  whole organisation**.
- The same role cannot be given twice on the same restaurant.
- The last active administrator cannot be removed or deactivated.
- Nobody can deactivate their own account.
- If the e-mail cannot be sent, the administrator is shown a temporary
  password once, to pass on by hand.

**Employee records** (same screen). An account is a login; an employee
record is the person: name, phone, main restaurant and the others they work
at, posts held, contract type, weekly hours or forfait jours, contract start,
and the 4-digit tablet PIN.

| Action | What happens |
|---|---|
| "Nouveau salarié" | Creates a person with no login. They appear on the planning of their restaurants and on the tablet, and are listed under "Salariés sans compte". |
| "Créer sa fiche salarié" on an account | Creates the person and attaches them to that account, which then has Ma semaine, Restaurant and Congés. |
| "Modifier la fiche salarié" | Changes the details, the restaurants, the posts, the current contract and, if typed, the PIN. Past shifts are untouched. |

The PIN is never shown again once saved; leaving the field empty keeps it.

Not possible from a screen: removing an employee, keeping a history of
contracts, importing employees from a file or from PayFit.

---

## 4. Access levels

Everyone can see the planning. Levels differ only in what they can change.
The server enforces every line below; the screens only hide what would be
refused.

| | Employee | Chef de cuisine | Manager | Resp. de site | Resp. multisite | Ops | RH | Admin |
|---|---|---|---|---|---|---|---|---|
| Scope | Own sites | One site | One site | One site | Her sites | All | All | All |
| See the planning | Published only | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Add / edit / delete shifts | — | Kitchen posts | — | Yes | Yes | — | — | Yes |
| Publish a week | — | Kitchen | — | Both | Both | — | — | Yes |
| Enter absences | — | Yes | — | Yes | Yes | — | Yes | Yes |
| Lock a day (blue) | — | — | — | Yes | Yes | — | — | Yes |
| Payslip lock (red) | — | — | — | — | — | — | Yes | Yes |
| See the Badgeuse | — | — | Yes | Yes | Yes | Yes | Yes | Yes |
| Validate hours | — | — | Yes | Yes | Yes | — | — | Yes |
| Decide leave | — | Kitchen staff | — | Salle staff, the chef | Directors, salle staff | — | Office, lab | Any |
| Register tablets, add posts | — | — | — | — | — | — | — | Yes |
| Accounts and roles | — | — | — | — | — | — | — | Yes (whole organisation) |

What a plain employee sees:
- Only the weeks, and within them only the department (kitchen or salle), that
  have been published.
- That colleagues work, never that a colleague is absent or why. On the
  read-only planning grid an absence shows as "Absent" without its type.

---

## 5. Building the planning

Screen: Gestion → **Planning**, for the site chosen in the header menu.

### 5.1 Views

| View | Rows | Shows |
|---|---|---|
| Semaine / Employés | One per employee of the site | Shift and absence cards, weekly counter |
| Semaine / Postes | One per post and service (all AM rows, then all PM rows) | Who is on each post, people and hours per cell, total per row |
| Mois | One per employee, one narrow column per day of the calendar month | Compact cards, hours and number of shifts per employee |

- Week navigation by arrows; "Aujourd'hui" returns to the current period.
  Clicking the dates opens a calendar of the month, one line per week with
  its number: the whole line lights up and a click goes to that week.
- The week number shown is the ISO week (Semaine 47).
- Each employee row shows the contract's weekly hours ("39h00"), or "Forfait jours".
- **Order of the rows**: "⇅ Ordre", under the Employés / Postes tabs, puts a
  handle and two arrows on each employee row. Drag a row onto another, or use
  ▲ ▼ (the way on a touch screen). The order is saved at once, for the
  restaurant: everyone sees it and the Badgeuse follows it. For those who may
  change shifts.
- **Today's column** is tinted and outlined from the header to the daily recap.
- **A closed day** (blue or red lock, see section 7) is greyed, its cards faded.
- **Weekly counter** (week view): planned hours plus the days of congé payé
  and of récupération JF, and the difference with the contract in red when
  over, blue when under. Such a day is worth a fifth of the contract and at
  most five days count per week. Other absences add nothing.
- **Absence cards** show what the day is worth: a fifth of the weekly contract
  (7h on 35 hours, 7.8h on 39), half of it for a half day, the hours given for
  custom hours. Nothing on forfait jours.
- **Daily recap** ("Heures planifiées"): number of people and total hours
  under each day, and the total of the period. The planning scrolls inside
  its own frame, so this bar stays at the bottom of the screen and the day
  headers at the top while the rows move. Hovering or clicking a day's total
  shows how its hours are shared out: one line per post and service, with
  hours, number of people and share of the day (Service AM 12h00 · 2 pers. ·
  14 %), midi before soir.
- **Compteur**: the header of the last column is a choice between "Total"
  and "Compteur". The counter is each person's hours over (red, +) or under
  (blue, −) their contract at this restaurant, added up week by week from the
  week of their first shift here to the week shown, included. It counts
  planned hours plus congé payé and récupération JF, against the contract in
  force each week; a week without weekly hours (forfait jours, extra, no
  contract) adds nothing. Shifts at another restaurant are not counted. The
  week's total stays underneath. Week view by employee only.
- **Taking someone off the planning**: a "×" on the employee's row (on hover;
  always visible in "Ordre" and on touch screens), for the site director and
  the multi-site manager. See section 5.5.
- The week view is dense on purpose: ten employee rows fit on a 1500 × 900
  screen at 100%, even with a coupure on each.
- Alerts are a count next to the employee and a chip for the whole week;
  hovering shows the list at once, clicking keeps it open.
- Shift cards show their duration as decimal hours (7.17h); totals, counters
  and recaps stay in hours and minutes (39h20).
- Shift cards take the colour of their post: light tint for AM, strong tint
  for PM. Absence cards are grey. A leave request still waiting shows as a
  dashed orange card, only to the people allowed to see that request.

### 5.2 Adding and changing

- **"+" on the top-left corner of a day**, shown when the cell is hovered,
  opens the editor. Clicking the empty part of a day does the same; on a
  touch screen, where nothing hovers, that is how a shift is added. From the view by post, the post and
  service are already set and the employee is chosen in the editor.
- **Clicking a card** opens the same editor on that card.
- The editor's title names the employee ("Modifier le shift de …") on the
  post's colour, and has two tabs.

| Tab | Fields |
|---|---|
| Shift | Start, end, break in minutes, resulting duration, post, service (AM / PM), meals taken, note. The break and meals follow the start time: 20 minutes and one meal, or none of either for a start at 12:00 or 19:00; both stay editable |
| Absence | Type (the 21 active types), from / to dates, whole day / half day / custom hours, note |

- Hours are chosen from two lists (hours, then minutes by five), always on 24
  hours. In the Badgeuse, paid hours are still typed, to the minute.
- A shift with a note shows a small mark on its card; hovering the card shows
  the note.
- An end time at or before the start means the shift ends the next day
  (16:30 → 00:30).
- Planned duration = length minus the break.
- Saving on the other tab converts the card: the shift is removed and an
  absence created, or the reverse.
- "Supprimer" deletes the card.

### 5.3 Moving, duplicating or deleting by dragging

While a shift card is dragged over another cell, that cell splits in two:
"Déplacer" on the left and "Dupliquer" on the right. Dropping on a half does
that: the shift leaves its original cell, or a copy is created and the
original stays. Hours, break, meals and note are kept. In the view by
employee the shift goes to that day and that person; in the view by post it
goes to that day with that row's post and service.

Dragging a shift out of the planning table and dropping it there deletes it.
A bar at the bottom of the screen says so while dragging. After the deletion,
"Annuler la suppression" stays for 8 seconds and puts the shift back.

Dragging works with a mouse.

### 5.3b Popular shifts

When adding or changing a shift, the editor offers up to six "Shifts
fréquents": the combinations of hours, post, service, break and meals this
restaurant has planned most often in the last two months (at least twice).
Clicking one fills the form; everything stays editable. Opened from a post's
row, that post's usual shifts come first.

The 🔥 button, next to "Besoins", opens the same shifts (up to twelve) as a
strip above the planning. Drag one onto an employee's day to create the shift
there, or click it and then click the days to put it on (Escape puts it
down). On the Employés views only, never on a closed day, and only for the
posts the restaurant uses.

### 5.3c The restaurant's needs

"Besoins", on the week view, opens a grid for the restaurant: for each day of
the week and each service (midi, soir), the number of people wanted on each
post, plus a total for the salle and a total for the kitchen. The rule is the
same every week. Set by the site director or the multi-site manager.

**The restaurant's own posts.** The same window is where a restaurant chooses
its posts, salle and kitchen apart: "×" on a line takes the post off, the
field under each department adds one, either an existing post (suggested
while typing) or a new name. Petit Bao Bastille can keep only Manager and
Service in the salle. The change is immediate and is for that restaurant only:
its list is what Besoins, the shift editor, the Postes view and the popular
shifts offer. A restaurant that never changed its list uses every post.
Taking a post off deletes the needs set on it; shifts already planned on it
stay and keep their row in the Postes view. A new post with the name of an
existing one is that same post.

The planning then compares the rule with what is planned. A chip
"⚠ n postes manquants" lists the gaps by day ("sam. 19 déc. · soir : Bar 0/1"),
and the same list appears in the publication menu before publishing. It is a
warning: publishing stays possible.

### 5.3d Filling a missing post

Each missing post in the list is a button, "… · Combler". It opens a window
with the people who could take the post, best choice first: they work at the
site, hold the post, are free on that service and not absent. Those the shift
would cause no new alert for come first, then those with the most hours left
on their contract that week. "Planifier" adds the shift with the restaurant's
most frequent hours for that post. The window stays open while people are
still missing, and says so when nobody is available. A department total
cannot be filled this way.

### 5.5 Taking someone off the planning (archiving)

A site director cannot archive an employee alone; HR decides. So that the
planning is clean meanwhile:

1. The director clicks "×" on the person's row and may give a reason. Refused
   while the person still has shifts to come at this restaurant: remove or
   reassign them first.
2. The person disappears from this restaurant's planning at once, and is no
   longer suggested to fill a missing post. A chip "n retiré(s)" in the
   toolbar lists them, with "Remettre sur le planning" to cancel the request.
   In a week where they still have shifts (a past week, or earlier this
   week), their row stays, greyed, at the bottom, marked "Archivage demandé".
3. HR accounts and administrators get a notification. The request is in
   Gestion → Demandes, under "Demandes d'archivage".
4. HR approves: the employee record is archived and leaves every planning.
   Refused while shifts to come remain in any restaurant. HR refuses, with an
   optional reason: the person is back on the planning. The director is
   notified either way.

Archiving does not delete anything and does not close the person's login;
that stays in Comptes.

### 5.4 What is refused

A shift (added by hand, edited or duplicated) is refused when:

| Reason | Message |
|---|---|
| The person already has a shift during those hours, at this or another restaurant | "… a déjà un shift sur ce créneau (à …)" |
| The person already has a post in that service (AM or PM) that day, at any restaurant | "… a déjà un poste sur le service … ce jour-là" |
| The person has an arrêt maladie that day | "Impossible de planifier ce salarié : Arrêt maladie ce jour-là" |
| The day is locked | "Le jj/mm/aaaa est verrouillé" |
| The person is not assigned to this site | "Ce salarié n'est pas affecté à ce site" |
| A head chef tries a salle post | Refused (no right) |

Two different people may hold the same post in the same service. A morning
and an evening shift on the same day (a coupure) are allowed. No other alert
exists: no check of weekly hours, rest days or legal limits.

---

## 6. Publishing a week

Kitchen and salle are published **separately, week by week**, from the
planning's week view.

- One drop-down menu on the week view. Its colour gives the state: orange
  "Non publié", blue "Partiellement publié", green "Publié".
- Inside, each department is a blue button ("Publier la cuisine", "Publier la
  salle") that becomes a grey box ("Cuisine publiée") once done, with a
  "Dépublier" link beside it.
- The head chef can act on the kitchen only and sees the salle's state. The
  site director and multi-site manager can act on both, and also have
  "Publier toute la semaine".
- An employee sees a shift once the department of its post is published for
  the week the shift starts in.
- After publication, changes show to employees immediately; there is no
  re-publication step.
- Nobody is notified when a week is published.

---

## 7. Locking a day

Each day of the planning has a lock, opened from the lock icon in the day's
header.

| State | Colour | Who sets or lifts it |
|---|---|---|
| Ouvert | Grey | — |
| Verrouillé | Blue | Site director, multi-site manager, administrator |
| Comptabilisé pour la paie | Red | HR, administrator |

A locked day (blue or red) refuses every change to its shifts, its absences
and its validated hours, and refuses the approval of a leave request that
covers it. Its column is greyed on the planning.

**Closed by the Badgeuse.** When the last line of a day is validated in the
Badgeuse (one by one or with "Valider la journée"), the day turns blue by
itself, whoever validated. Never a day still to come, never a day without any
line, and a lock already set is left alone. To correct a line afterwards, a
site director reopens the day from its lock; removing a validation does not
reopen it.

---

## 8. Clocking on the tablet

Address: `/kiosk`, on a tablet kept at the site.

**Set-up (once per tablet).** An administrator opens the Badgeuse tab of the
site, clicks "Enregistrer une tablette", names it, and gets a code shown once.
The code is typed on the tablet, which is then tied to that site. A tablet can
be revoked through the server; there is no button for it.

**Clocking.**
1. The tablet shows the names of everyone who clocks at the site (forfait
   jours staff are left out), sorted by first name.
2. Typing letters narrows the list: each typed word must start the first name
   or a word of the last name. Accents and capitals are ignored. The employee
   taps their name.
3. They enter their 4-digit PIN on the keypad.
4. The tablet offers what makes sense: "Pointer mon arrivée"; or, once
   clocked in, "Début de pause" and "Pointer mon départ"; or, during a break,
   "Fin de pause".
5. A confirmation shows for three seconds, then the tablet returns to step 1.

Rules:
- Only employees assigned to the tablet's site appear.
- Employees on forfait jours do not appear.
- A wrong PIN is refused with one message, whatever the cause.
- After 30 seconds without a touch the tablet returns to step 1.
- Someone clocked in more than 16 hours ago is offered "arrivée" again.
- Clocking without a planned shift is accepted.
- A clocking sent twice is stored once.
- Clockings can never be edited or deleted, not even directly in the
  database: it refuses.
- The tablet needs an internet connection.

The PIN is set by an administrator in the employee record (Comptes screen).

---

## 9. How hours are calculated

These rules live in one tested package (`packages/labor-rules`). They turn a
planned shift and a clock-in / clock-out pair into the hours that count.

### 9.1 Pairing clockings

- A clock-in opens a stretch of work; the next clock-out closes it.
- A second clock-in before a clock-out means the first clock-out was
  forgotten.
- Breaks clocked between the two are added up.
- A clock-out with no clock-in before it is set aside.

### 9.2 Matching a stretch to a shift

A stretch belongs to the earliest shift of that person, not already taken,
that it overlaps in time. Arriving early counts as overlapping the shift. With
no clock-out, the stretch is only attached to a shift starting within 4 hours.
No match means "sans shift prévu".

### 9.3 The counted hours

| Situation | Counted |
|---|---|
| Clock-in before the planned start | From the planned start |
| Clock-in after the planned start | From the clock-in ("Arrivée en retard") |
| Clock-out before the planned end | Until the clock-out ("Départ anticipé") |
| Clock-out up to 10 minutes after the planned end | Until the planned end |
| Clock-out 11 minutes or more after | Only the minutes past the 10th: 14 late = 4, 16 late = 6 |
| Coupure, end of the service before the break | Until the planned end, whatever the clock-out |
| Coupure, end of the last service of the day | The usual rule above |
| No clock-out, shift planned | Until the planned end, flagged "Départ non badgé" |
| No clock-out, no shift | No end, no total, flagged |
| No planned shift | The clocked times as they are, flagged "Sans shift prévu" |
| Still at work (clocked in less than 16 hours ago, not out) | No end and no total yet |

- Seconds are dropped: 09:00:59 counts as 09:00.
- **Break**: the break set on the shift is deducted, whatever the shift's
  length. It is 20 minutes by default, and 0 for a shift starting at 12:00 or
  19:00 (which also has no meal). On a coupure that is 20 minutes per
  shift, 40 for the day. A clocked break does not change the deduction; it is
  flagged when it differs.
- A coupure is recognised when the person has several shifts starting the
  same day at the site.
- The total never goes below zero.

---

## 10. Validating hours in the Badgeuse

Screen: Gestion → **Badgeuse**, laid out like Skello's (rebuilt 2026-11-20).

- **Week:** chosen at the top left with the arrows, or by clicking the dates,
  which opens a month calendar with week numbers.
- **Journée:** one day, one line per planned shift of every employee, people
  in the planning's order (`SiteAssignment.planningOrder`, copied from Skello
  for Petit Bao Bastille).
- **Employés:** one employee picked in the list on the left, one line per
  planned shift of their week, with the hours validated so far and the number
  of late arrivals. "Valider la semaine" validates their lines.
- **Abs.:** ticking it turns the paid hours of the line into an absence: a
  list of absence types ("Absence injustifiée" proposed first) and the hours
  of the absence, which start as the planned shift's. Validating puts that
  absence on the planning for those hours and pays 0 hour and 0 meal
  (`TimeEntry.absent`, `TimeEntry.absenceId`). The planned shift stays.
  Removing the validation removes the absence.
- **Total durée** is in decimal hours (6.67h).

Not copied from Skello: the "Historique" tab, the "Position" column, the "⋮"
actions, print and download.


**Layout.**
- Left: the seven days of the week, each with a tick that turns green when
  every line of the day is validated.
- Top right: when the tablet last sent a clocking, and "Valider la journée".
- Tab "Prévus": one line per planned shift of the day, plus one per clocking
  that matched no shift. Shifts not clocked yet are listed too.
- Tab "Absences planifiées": the absences planned that day for the site's staff.

**Each line shows** the employee, post and service, the points to check, the
planned shift and its break, the clocked times and clocked break, then the
**paid** start, end, break and meals (all editable), the total and a note.
A coloured time in the planned or clocked columns is the one the paid hours
currently use: green for the start, violet for the end, orange for the break.

**Actions.**
- The tick on a line validates it with the paid values on screen. Clicking a
  green tick removes the validation.
- "Valider la journée" validates every line whose paid start and end are filled.
- Editing a validated line and ticking again replaces the validation.
- A shift nobody clocked can be validated by typing its paid hours.

**Rules.**
- The paid values start from what section 9 computes, or from the previous
  validation.
- A validation is marked "corrected" when the paid start, end or break differ
  from what the rules computed. The note is optional.
- Validated hours are stored separately; the clockings are untouched.
- A locked day refuses any change.
- HR and the operations team see the screen without being able to validate.
- A line still "en poste" cannot be validated until it has an end time.

---

## 11. Leave requests

### 11.1 Asking (Mon espace → Congés)

- "Demander un congé" opens a form: type, from / to dates, and for a single
  day: whole day, half day or exact hours; an optional comment.
- Ten absence types can be requested: Congé payé, RTT, Congé événementiel,
  Congé mariage / PACS, Congé naissance, Congé maternité, Congé paternité,
  Congé supplémentaire de naissance, Congé sans solde, Récupération.
- **The earliest start is the Monday after the current week.** The form does
  not allow an earlier date and the server refuses it.
- The request goes to the managers of the employee's main restaurant.
- The employee sees their requests grouped as waiting, leave to come, and
  history, with who decides and any reason given. A waiting request can be
  withdrawn.

### 11.2 Who decides

Worked out when the request is made, and stored with it.

| Request from | Decided by |
|---|---|
| Salle staff, or someone holding both kitchen and salle posts | Site director |
| Kitchen staff (every post held is a kitchen post) | Head chef |
| The head chef | Site director |
| A site director | Multi-site manager |
| A multi-site manager | Operations team |
| The operations team, office or lab staff | HR |

- The multi-site manager can also decide what her site directors decide.
- An administrator can decide any request.
- Nobody decides their own request.

### 11.3 Deciding (Gestion → Demandes)

- The tab shows requests waiting, then those already handled. A counter on
  the tab gives the number waiting for that person's decision.
- **Who sees what**: the people who decide a request; plus the site director
  and the multi-site manager for every request of their restaurants (without
  deciding the kitchen ones); the head chef sees kitchen requests only;
  managers see none.
- Each request shows the employee, type, dates, comment, who decides, and how
  many shifts are already planned over the period.
- "Approuver" creates the absence on the planning. Shifts already planned are
  not removed.
- "Refuser" asks for an optional reason, shown to the employee.
- A request already handled cannot be decided again.
- Approval is refused if one of the days is locked.
- Nobody is notified by e-mail or push at any step.

---

## 12. A problem at the last minute

A shift cannot be cancelled from the application.

- In Mon espace, each shift of the **current week** that is not over, and the
  "next shift" card, has a button "Un empêchement ?".
- It opens a screen saying to call directly, with the name, role and phone
  number of the person to call, and an "Appeler" button that dials on a phone.
- **Who to call**: the employee planned on the Manager post during those
  hours at that restaurant. If nobody is, the site director(s) of the site.
- If that person has no phone number recorded, the screen says so.
- Nothing is sent to anyone and nothing changes on the planning.
- Each employee enters their own phone number in Profil. It is shown to
  colleagues only in this screen.

---

## 13. Mon espace, screen by screen

Only published weeks are shown here, including to a manager looking at their
own space.

**Ma semaine** (`/moi`)
- "Prochain shift": day, hours, restaurant, post, and the colleagues working
  those hours. Shown whatever week is displayed.
- The week, with arrows to move between weeks.
- Hours planned against the contract, as a bar, with the number of shifts;
  for someone working in several restaurants, the split per restaurant.
- Each day: shifts (hours, duration, post and service, restaurant when the
  person has several, colleagues), approved absences, requests still waiting,
  or "Repos".
- Tapping the colleagues unfolds their names and posts. "Working with" means
  same restaurant and overlapping hours.
- A week not published shows "Planning pas encore publié" instead of days; a
  restaurant only partly published gets a note.

**Restaurant** (`/moi/restaurant`)
- A switch between the person's restaurants, the main one first.
- Seven day buttons; a dot marks the days the person works there.
- The line-up of the chosen day: "Service du midi" then "Service du soir",
  each split into Salle and Cuisine, with name, post and hours. The person's
  own line is highlighted.
- Absences are never shown.

**Congés** (`/moi/conges`) — see section 11.1.

**Profil** (`/moi/profil`)
- Name, e-mail, contract hours per week (or forfait jours), roles.
- Phone number, editable.
- One card per restaurant, the main one first: this week's shifts and hours
  there, the next shift there, a link to its planning.
- The posts held.
- Password change, the link to Gestion for people with a role, log out.

---

## 14. The audit log

Every change below is recorded with who did it and when, and for most of them
the values before and after. There is no screen to read the log.

| Area | Recorded |
|---|---|
| Planning | Shift created, changed, deleted; absence created, changed, deleted; week published or unpublished; day locked or unlocked |
| Badgeuse | Hours validated, validation changed, validation removed |
| Leave | Requested, withdrawn, approved, refused |
| Accounts | Created, role given, role removed, password link sent, activated, deactivated |
| Set-up | Tablet registered or revoked, PIN set, post added |

Passwords and PINs are never written to the log. Clockings are not in the
log because they are themselves the permanent record.

---

## 15. What is not built

**Employees and structure**
- Removing an employee, contract history, importing employees from a file.
- The PayFit connection (employees, contracts, absences).
- Revoking a tablet, adding or recolouring a post: these exist on the server
  but have no screen.
- Posts per restaurant: there is one list for the whole company.

**Planning**
- Any alert: weekly maximum, rest days, hours against contract, legal limits.
- AM / PM time windows per restaurant.
- Templates, copying a week, the day view, the view by post in the month.
- Shifts with no employee ("Non assignés"), tasks, attached files.
- Formation and visite médicale as planning items.
- Absences counted in the weekly counter.
- Notifications when a week is published or changed.

**Time clock and hours**
- The tablet working without internet.
- The NPT / NTT note ("ne pas toucher").
- Meals rules (expected number per shift).
- The Badgeuse tabs "Employés" and "Historique", and the columns "Position",
  "Abs." and "Actions" of the Skello screen.

**Leave**
- Balances and counters (congés payés, RTT, récupération).
- Shift-swap requests.
- Any exemption from the next-week rule.
- Sending approved leave to PayFit.
- Notifying the multi-site manager, or anyone, by e-mail or push.

**Reports and payroll**
- The Rapport for the multi-site director, and every export.
- Pay periods, the end-of-period anomaly report, director scoring.
- Payroll variables, extras, payslip checks, SAV paie.
- Labour cost and social analysis.

**Profile**
- Dossier RH, Mes documents, Notifications, Synchroniser le calendrier.
- Editing one's name or language.

**Running it for real**
- Real e-mail: only a fake mailbox in development is configured.
- Installation on the VPS, backups, HTTPS.
- Push notifications and installing the app on a phone.
- A screen to read the audit log.
- English.

---

## 16. Reference

### 16.1 Screens

| Address | Screen | Needs |
|---|---|---|
| `/login` | Log in | — |
| `/mot-de-passe-oublie` | Ask for a password link | — |
| `/mot-de-passe?token=…` | Choose a password | A valid link |
| `/` | Sends to the right space | Login |
| `/moi` | Ma semaine | An employee account |
| `/moi/restaurant`, `/moi/restaurant/:siteId` | Restaurant line-up | An employee account |
| `/moi/conges` | Congés | An employee account |
| `/moi/profil` | Profil | Login |
| `/sites/:siteId/planning` | Planning | A role, or an employee of the site (read-only) |
| `/sites/:siteId/badgeuse` | Badgeuse | Manager, director, multi-site, HR, ops, admin |
| `/demandes` | Leave requests to decide or follow | Chef, director, multi-site, HR, admin |
| `/comptes` | Accounts and roles | Administrator of the organisation |
| `/kiosk` | Tablet time clock | The tablet's code |

### 16.2 Server routes

All under `/api`. "Session" means a logged-in account.

| Area | Routes |
|---|---|
| Login | `POST auth/login`, `POST auth/logout`, `GET auth/me`, `POST auth/forgot-password`, `POST auth/set-password`, `POST auth/change-password` |
| Accounts | `GET accounts`, `GET accounts/options`, `POST accounts`, `POST accounts/:id/reset-password`, `PUT accounts/:id/active`, `POST accounts/:id/grants`, `DELETE accounts/:id/grants/:grantId` |
| Structure | `GET sites`, `GET posts`, `POST posts`, `GET sites/:siteId/employees`, `PUT employees/:id/pin` |
| Tablets | `GET sites/:siteId/devices`, `POST sites/:siteId/devices`, `DELETE devices/:id` |
| Planning | `GET sites/:siteId/planning`, `POST / PATCH / DELETE sites/:siteId/shifts`, `POST / PATCH / DELETE sites/:siteId/absences`, `PUT sites/:siteId/weeks/:monday/publication`, `PUT sites/:siteId/days/:date/lock`, `PUT sites/:siteId/planning-order`, `GET / POST sites/:siteId/posts`, `DELETE sites/:siteId/posts/:postId`, `POST sites/:siteId/employees/:employeeId/archive-request`, `GET archive-requests`, `POST archive-requests/:id/decision`, `POST archive-requests/:id/cancel`. `GET planning` takes `counter=1` for the hours counters |
| Badgeuse | `GET sites/:siteId/hours`, `GET sites/:siteId/hours/week`, `POST sites/:siteId/time-entries`, `DELETE sites/:siteId/time-entries/:id` |
| Leave | `GET leave/types`, `GET leave/mine`, `POST leave`, `POST leave/:id/cancel`, `GET leave/inbox`, `POST leave/:id/decision` |
| Mon espace | `GET me`, `PUT me/phone`, `GET me/week`, `GET me/sites/:siteId/week` |
| Tablet | `GET kiosk/site`, `GET kiosk/employees`, `POST kiosk/identify`, `POST kiosk/clock` (tablet code, no session) |

### 16.3 Data

| Table | Holds |
|---|---|
| LegalEntity, Site | The 13 entities and their sites (11 restaurants, lab, office) |
| Post | The posts, their department (kitchen / salle), colour, and whether the post runs the service |
| Employee, Contract | People, phone, tablet PIN (hashed), contract type and weekly hours |
| SiteAssignment, EmployeePost | Which restaurants a person works at (one is the main one), their row in that restaurant's planning, and which posts they hold |
| SitePost | The posts a restaurant uses; none = every post |
| ArchiveRequest | Requests to archive an employee: who asked, for which site, HR's decision |
| User, RoleGrant, PasswordToken | Logins, roles per site, one-time password links |
| Device | Registered tablets |
| Shift | Planned shifts: person, post, service, start, end, break, meals, note |
| Publication | Which department of which week is published, per site |
| DayLock | Locked days, per site |
| AbsenceType, Absence | The 66 absence types (21 active) and the absences on the planning |
| LeaveRequest | Leave requests, who decides them, their outcome |
| ClockEvent | Raw clockings, never modifiable |
| TimeEntry | Validated hours and meals |
| AuditLog | Who changed what |

### 16.4 Values fixed in the code

| Value | Setting |
|---|---|
| Tolerance on a late clock-out | 10 minutes |
| Break deducted per shift | 20 minutes; 0 for a start at 12:00 or 19:00; changeable per shift |
| Value of an absence day | Weekly contract ÷ 5 |
| Paid leave earned | 2.08 days a month (recorded; not used yet) |
| "Still at work" after a clock-in | 16 hours |
| Early clock-in attached to a shift | Up to 4 hours before |
| Tablet returns to the start | After 30 seconds idle |
| Login stays valid | 30 days |
| Invitation link | 7 days |
| Forgotten-password link | 1 hour, one e-mail per 5 minutes |
| Password length | At least 10 characters |
| PIN | 4 digits |
| Leave earliest start | The Monday after the current week |

### 16.5 Tests

60 automated tests: 33 on the hours rules and date handling, 27 on rights and
leave routing. The screens are checked by hand and by scripted browser runs,
not by permanent tests.
