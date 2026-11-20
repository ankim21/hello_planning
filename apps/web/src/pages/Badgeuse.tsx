/**
 * Badgeuse, laid out like Skello's. Two views of the same week:
 *  - "Journée": one day, one line per planned shift of every employee;
 *  - "Employés": one employee, one line per planned shift of their week.
 * A line shows what was planned, what was clocked, and the paid hours, which
 * the manager can change before validating. Clockings that match no shift
 * get a line too.
 *
 * The paid hours start from what the company rules compute. A coloured time
 * in the planned or clocked columns is the one the paid hours currently use:
 * green for the start, violet for the end, orange for the break.
 *
 * Validating stores the paid hours; the raw clockings are never changed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import {
  api,
  type BadgeRow,
  type BadgeWeek,
  type EmployeeWeekReport,
  type HoursReport,
  type Site,
} from "../api.ts";
import { TIME, TimeField } from "./CardEditor.tsx";
import {
  addDays,
  capitalise,
  dayLabel,
  decimalHours,
  minutesBetween,
  mondayOf,
  today,
  weekNumber,
} from "./dates.ts";
import { Shell } from "./Shell.tsx";

const FLAG_LABELS: Record<string, string> = {
  UNPLANNED: "Sans shift prévu",
  MISSING_CLOCK_OUT: "Départ non badgé",
  LATE_ARRIVAL: "Arrivée en retard",
  EARLY_DEPARTURE: "Départ anticipé",
  LATE_DEPARTURE_COUNTED: "Départ tardif compté",
  LATE_DEPARTURE_NOT_COUNTED_COUPURE:
    "Départ tardif non compté (avant la coupure)",
  CLOCKED_BREAK_DIFFERS: "Pause badgée différente",
};

/** The paid hours of a line, as being edited on screen. */
interface Draft {
  start: string;
  end: string;
  breakMinutes: number;
  meals: number;
  /** "Abs.": did not come. `start` and `end` are then those of the absence. */
  absent: boolean;
  absenceTypeId: string;
  note: string;
}

/** Where a line starts from: what was validated, else what the rules compute. */
function initialDraft(row: BadgeRow): Draft {
  if (row.validation) {
    const { start, end, breakMinutes, meals, absent, absenceTypeId, reason } =
      row.validation;
    return {
      start,
      end,
      breakMinutes,
      meals,
      absent,
      absenceTypeId: absenceTypeId ?? "",
      note: reason ?? "",
    };
  }
  return {
    start: row.computed?.start ?? "",
    end: row.computed?.end ?? "",
    breakMinutes: row.computed?.breakMinutes ?? row.shift?.breakMinutes ?? 0,
    meals: row.shift?.meals ?? 0,
    absent: false,
    absenceTypeId: "",
    note: "",
  };
}

const same = (a: Draft, b: Draft) =>
  a.start === b.start &&
  a.end === b.end &&
  a.breakMinutes === b.breakMinutes &&
  a.meals === b.meals &&
  a.absent === b.absent &&
  a.absenceTypeId === b.absenceTypeId &&
  a.note === b.note;

/** Ready to validate: both times filled and, when absent, a type chosen. */
const complete = (draft: Draft) =>
  TIME.test(draft.start) &&
  TIME.test(draft.end) &&
  (!draft.absent || draft.absenceTypeId !== "");

/**
 * "Total durée" of a line as edited: the paid time, break deducted, or the
 * length of the absence (no break in an absence). 0 while not filled.
 */
const totalMinutes = (draft: Draft) =>
  TIME.test(draft.start) && TIME.test(draft.end)
    ? Math.max(
        0,
        minutesBetween(draft.start, draft.end) -
          (draft.absent ? 0 : draft.breakMinutes),
      )
    : 0;

/** The type proposed first when "Abs." is ticked. */
const DEFAULT_ABSENCE = "Absence injustifiée";

/** "il y a 3 heures" */
function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const h = Math.round(minutes / 60);
  if (h < 24) return `il y a ${h} heure${h > 1 ? "s" : ""}`;
  const d = Math.round(h / 24);
  return `il y a ${d} jour${d > 1 ? "s" : ""}`;
}

export function Badgeuse() {
  const { siteId } = useParams();
  return (
    <Shell siteId={siteId} section="badgeuse">
      {({ sites }) => (
        <Week key={siteId} site={sites.find((s) => s.id === siteId)} />
      )}
    </Shell>
  );
}

type View = "day" | "people";

function Week({ site }: { site: Site | undefined }) {
  const [day, setDay] = useState(today);
  const [view, setView] = useState<View>("day");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [week, setWeek] = useState<BadgeWeek | null>(null);
  const [dayReport, setDayReport] = useState<HoursReport | null>(null);
  const [personReport, setPersonReport] = useState<EmployeeWeekReport | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [tab, setTab] = useState<"planned" | "absences">("planned");
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const siteId = site?.id;
  const monday = mondayOf(day);

  const people = week?.people ?? [];
  // The person shown in the "Employés" view: the one chosen, else the first.
  const person =
    people.find((p) => p.employee.id === employeeId) ?? people[0] ?? null;
  const personId = person?.employee.id ?? null;

  // What the main panel shows: a day, or a person's week. Kept apart from the
  // week summary so that the summary arriving does not reload the panel and
  // wipe what is being typed.
  const target =
    view === "day"
      ? `hours?date=${day}`
      : personId && `hours/employee?date=${monday}&employeeId=${personId}`;

  const loadWeek = useCallback(() => {
    if (!siteId) return;
    api<BadgeWeek>(`/sites/${siteId}/hours/week?date=${monday}`)
      .then(setWeek)
      .catch(() => setWeek(null));
  }, [siteId, monday]);

  const loadReport = useCallback(() => {
    if (!siteId || !target) return;
    api<HoursReport | EmployeeWeekReport>(`/sites/${siteId}/${target}`)
      .then((data) => {
        if ("date" in data) setDayReport(data);
        else setPersonReport(data);
        setDrafts({}); // back to what the server holds
        setError(null);
      })
      .catch((caught) => setError((caught as Error).message));
  }, [siteId, target]);

  useEffect(loadWeek, [loadWeek]);
  useEffect(loadReport, [loadReport]);
  const load = () => {
    loadWeek();
    loadReport();
  };

  if (!site) {
    return (
      <main>
        <p className="error">Site introuvable.</p>
      </main>
    );
  }

  const report = view === "day" ? dayReport : personReport;
  const rows = report?.rows ?? [];
  // HR and the operations team look at the week without changing it.
  const canValidate = report?.canValidate ?? false;
  const draftOf = (row: BadgeRow) => drafts[row.key] ?? initialDraft(row);
  const edit = (row: BadgeRow, change: Partial<Draft>) =>
    setDrafts((all) => ({ ...all, [row.key]: { ...draftOf(row), ...change } }));
  const dirty = (row: BadgeRow) => !same(draftOf(row), initialDraft(row));

  /** Saves the paid hours of one line as validated. */
  function save(row: BadgeRow) {
    const draft = draftOf(row);
    const computed = row.computed;
    // "Corrected" = the manager changed what the rules computed.
    const corrected =
      draft.absent ||
      !computed ||
      draft.start !== computed.start ||
      draft.end !== computed.end ||
      draft.breakMinutes !== computed.breakMinutes;
    return api(`/sites/${site!.id}/time-entries`, {
      method: "POST",
      body: {
        employeeId: row.employee.id,
        clockInAt: row.clocked?.clockInAt,
        shiftId: row.shift?.id,
        date: row.date,
        start: draft.start,
        end: draft.end,
        breakMinutes: draft.absent ? 0 : draft.breakMinutes,
        meals: draft.absent ? 0 : draft.meals,
        absent: draft.absent,
        absenceTypeId: draft.absent ? draft.absenceTypeId : undefined,
        corrected,
        reason: draft.note,
      },
    });
  }

  async function change(action: () => Promise<unknown>) {
    try {
      await action();
      load();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  /** The tick of a line: validates it, or removes the validation. */
  function toggle(row: BadgeRow) {
    if (row.validation && !dirty(row)) {
      const id = row.validation.id;
      change(() =>
        api(`/sites/${site!.id}/time-entries/${id}`, { method: "DELETE" }),
      );
    } else {
      change(() => save(row));
    }
  }

  const toValidate = rows.filter(
    (row) => complete(draftOf(row)) && (!row.validation || dirty(row)),
  );
  const validated = rows.filter((row) => row.validation).length;
  const isAdmin = site.rights.manageTablets;
  const lastSyncAt = report?.lastSyncAt ?? null;
  const shown = people.filter((p) =>
    `${p.employee.firstName} ${p.employee.lastName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  async function registerTablet() {
    const name = window.prompt(
      `Nom de la nouvelle tablette pour ${site!.name} ?`,
    );
    if (!name) return;
    const { token } = await api<{ token: string }>(
      `/sites/${site!.id}/devices`,
      {
        method: "POST",
        body: { name },
      },
    );
    setNewToken(token);
  }

  const absences =
    (view === "day" ? dayReport?.absences : personReport?.absences) ?? [];
  const absenceTypes = report?.absenceTypes ?? [];

  /** Ticking "Abs.": the line becomes an absence over the planned hours. */
  function setAbsent(row: BadgeRow, absent: boolean) {
    if (!absent)
      return edit(row, {
        ...initialDraft({ ...row, validation: null }),
        note: draftOf(row).note,
      });
    edit(row, {
      absent: true,
      absenceTypeId:
        absenceTypes.find((type) => type.name === DEFAULT_ABSENCE)?.id ?? "",
      start: row.shift!.start,
      end: row.shift!.end,
      meals: 0,
    });
  }

  return (
    <main className="wide">
      <div className="row toolbar badge-toolbar">
        <span className="period">
          <button
            onClick={() => setDay(addDays(day, -7))}
            aria-label="Semaine précédente"
          >
            ‹
          </button>
          <WeekPicker day={day} onPick={setDay} />
          <button
            onClick={() => setDay(addDays(day, 7))}
            aria-label="Semaine suivante"
          >
            ›
          </button>
          <span className="chip">Semaine {weekNumber(monday)}</span>
        </span>
        <span className="tabs views">
          <button
            className={view === "day" ? "active" : ""}
            onClick={() => setView("day")}
          >
            Journée
          </button>
          <button
            className={view === "people" ? "active" : ""}
            onClick={() => setView("people")}
          >
            Employés
          </button>
        </span>
        <span className="period">
          <span className="muted hint">
            {lastSyncAt
              ? `Synchronisation avec la tablette ${ago(lastSyncAt)}`
              : "Aucun badgeage reçu"}
          </span>
          <button
            className="primary"
            disabled={!canValidate || toValidate.length === 0}
            onClick={() => change(() => Promise.all(toValidate.map(save)))}
          >
            {view === "day" ? "Valider la journée" : "Valider la semaine"}
          </button>
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="badgeuse">
        {view === "day" ? (
          <nav className="days panel" aria-label="Jours de la semaine">
            {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map(
              (date) => {
                const info = week?.days.find((entry) => entry.date === date);
                const done =
                  info !== undefined &&
                  info.rows > 0 &&
                  info.validated === info.rows;
                return (
                  <button
                    key={date}
                    className={date === day ? "active" : ""}
                    onClick={() => setDay(date)}
                  >
                    <span>
                      {capitalise(
                        dayLabel(date, {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                        }),
                      )}
                    </span>
                    <span
                      className={done ? "tick done" : "tick"}
                      title={
                        info
                          ? `${info.validated}/${info.rows} validés`
                          : undefined
                      }
                    >
                      ✓
                    </span>
                  </button>
                );
              },
            )}
          </nav>
        ) : (
          <nav
            className="days people panel"
            aria-label="Employés de la semaine"
          >
            <input
              type="search"
              placeholder="Rechercher"
              aria-label="Rechercher un employé"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {shown.map((p) => (
              <button
                key={p.employee.id}
                className={p.employee.id === personId ? "active" : ""}
                onClick={() => setEmployeeId(p.employee.id)}
              >
                <span>
                  {p.employee.firstName} {p.employee.lastName}
                </span>
                <span
                  className={p.validated === p.rows ? "tick done" : "tick"}
                  title={`${p.validated}/${p.rows} validés`}
                >
                  ✓
                </span>
              </button>
            ))}
            {week && people.length === 0 && (
              <p className="muted">
                Aucun shift prévu ni badgeage cette semaine.
              </p>
            )}
          </nav>
        )}

        <section className="panel day-panel">
          {view === "people" && person && (
            <div className="badge-summary">
              <div className="stat main">
                <span>Heures travaillées</span>
                <strong>
                  {decimalHours(personReport?.workedMinutes ?? 0)}
                </strong>
              </div>
              <div className="stat">
                <span>Retard</span>
                <strong>{personReport?.lateArrivals ?? 0}</strong>
              </div>
            </div>
          )}

          <div className="segmented">
            <button
              className={tab === "planned" ? "active" : ""}
              onClick={() => setTab("planned")}
            >
              Prévus ({rows.length})
            </button>
            <button
              className={tab === "absences" ? "active" : ""}
              onClick={() => setTab("absences")}
            >
              Absences planifiées ({absences.length})
            </button>
          </div>

          <p
            className={
              validated === rows.length && rows.length > 0
                ? "banner done"
                : "banner"
            }
          >
            <strong>
              {validated === rows.length && rows.length > 0
                ? "Validé"
                : "En attente de validation"}{" "}
              : {validated}/{rows.length} shifts validés
            </strong>
            {canValidate && (
              <span>
                Pour valider vos modifications, cliquez sur{" "}
                <b>
                  {view === "day" ? "valider la journée" : "valider la semaine"}
                </b>
                .
              </span>
            )}
          </p>

          {tab === "planned" ? (
            <div className="table-scroll">
              <table
                className={
                  canValidate ? "list badge-table" : "list badge-table readonly"
                }
              >
                <thead>
                  <tr>
                    <th>Validé</th>
                    <th>{view === "day" ? "Employés" : "Jours"}</th>
                    <th>Shifts prévus</th>
                    <th>Pause</th>
                    <th className="group">Shifts badgés</th>
                    <th>Pause</th>
                    <th className="group">Shifts rémunérés</th>
                    <th>Pause</th>
                    <th>Abs.</th>
                    <th className="group">Repas</th>
                    <th>Total durée</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const draft = draftOf(row);
                    const isValidated = row.validation !== null && !dirty(row);
                    // A time is coloured when the paid hours use it.
                    const from = (
                      time: string | null | undefined,
                      paid: string,
                      kind: string,
                    ) =>
                      time ? (
                        <span
                          className={time === paid ? `time ${kind}` : "time"}
                        >
                          {time}
                        </span>
                      ) : (
                        <span className="time none">—</span>
                      );
                    return (
                      <tr
                        key={row.key}
                        className={isValidated ? "validated" : ""}
                      >
                        <td>
                          <button
                            className={isValidated ? "tick done" : "tick"}
                            disabled={!canValidate || !complete(draft)}
                            aria-label={
                              isValidated
                                ? `Annuler la validation de ${row.employee.firstName}`
                                : `Valider ${row.employee.firstName}`
                            }
                            title={
                              isValidated ? "Annuler la validation" : "Valider"
                            }
                            onClick={() => toggle(row)}
                          >
                            ✓
                          </button>
                        </td>
                        <td className="who">
                          {view === "day" ? (
                            <>
                              <span>{row.employee.firstName}</span>
                              <strong>{row.employee.lastName}</strong>
                            </>
                          ) : (
                            <strong>
                              {capitalise(
                                dayLabel(row.date, {
                                  weekday: "long",
                                  day: "numeric",
                                }),
                              )}
                            </strong>
                          )}
                          <span className="muted">
                            {row.shift
                              ? `${row.shift.post} ${row.shift.service}`
                              : "Sans shift prévu"}
                            {row.inProgress && " · en poste"}
                          </span>
                          {row.computed?.flags
                            .filter((flag) => flag !== "UNPLANNED")
                            .map((flag) => (
                              <span key={flag} className="flag">
                                {FLAG_LABELS[flag] ?? flag}
                              </span>
                            ))}
                        </td>
                        <td className="times">
                          {from(row.shift?.start, draft.start, "start")} –{" "}
                          {from(row.shift?.end, draft.end, "end")}
                        </td>
                        <td>
                          {row.shift ? (
                            <span
                              className={
                                !draft.absent &&
                                row.shift.breakMinutes === draft.breakMinutes
                                  ? "time break"
                                  : "time"
                              }
                            >
                              {row.shift.breakMinutes} mn
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="times group">
                          {row.clocked ? (
                            <>
                              {from(row.clocked.start, draft.start, "start")} –{" "}
                              {from(row.clocked.end, draft.end, "end")}
                            </>
                          ) : (
                            <span className="muted">Pas de badge</span>
                          )}
                        </td>
                        <td>
                          {row.clocked ? `${row.clocked.breakMinutes} mn` : "—"}
                        </td>
                        {draft.absent ? (
                          <td className="paid group absence" colSpan={2}>
                            <select
                              aria-label="Type d'absence"
                              value={draft.absenceTypeId}
                              onChange={(e) =>
                                edit(row, { absenceTypeId: e.target.value })
                              }
                            >
                              <option value="" disabled>
                                Type d'absence
                              </option>
                              {absenceTypes.map((type) => (
                                <option key={type.id} value={type.id}>
                                  {type.name}
                                </option>
                              ))}
                            </select>
                            <TimeField
                              value={draft.start}
                              onChange={(start) => edit(row, { start })}
                            />
                            {" – "}
                            <TimeField
                              value={draft.end}
                              onChange={(end) => edit(row, { end })}
                            />
                          </td>
                        ) : (
                          <>
                            <td className="paid group">
                              <TimeField
                                value={draft.start}
                                onChange={(start) => edit(row, { start })}
                              />
                              {" – "}
                              <TimeField
                                value={draft.end}
                                onChange={(end) => edit(row, { end })}
                              />
                            </td>
                            <td>
                              <input
                                className="small"
                                type="number"
                                min={0}
                                aria-label="Pause rémunérée en minutes"
                                value={draft.breakMinutes}
                                onChange={(e) =>
                                  edit(row, {
                                    breakMinutes: Number(e.target.value),
                                  })
                                }
                              />
                            </td>
                          </>
                        )}
                        <td>
                          <input
                            type="checkbox"
                            className="abs"
                            // Absent from what? Only a planned shift can be missed.
                            disabled={!canValidate || !row.shift}
                            aria-label={`${row.employee.firstName} ${row.employee.lastName} absent`}
                            title="Absent : une absence est ajoutée au planning"
                            checked={draft.absent}
                            onChange={(e) => setAbsent(row, e.target.checked)}
                          />
                        </td>
                        <td className="group">
                          {!draft.absent && (
                            <input
                              className="small"
                              type="number"
                              min={0}
                              aria-label="Repas"
                              value={draft.meals}
                              onChange={(e) =>
                                edit(row, { meals: Number(e.target.value) })
                              }
                            />
                          )}
                        </td>
                        <td>
                          <strong>{decimalHours(totalMinutes(draft))}</strong>
                        </td>
                        <td>
                          <input
                            className="note"
                            placeholder="Ajouter une note"
                            value={draft.note}
                            onChange={(e) =>
                              edit(row, { note: e.target.value })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="muted">
                        {view === "day"
                          ? "Aucun shift prévu ni badgeage ce jour-là."
                          : "Aucun shift prévu ni badgeage cette semaine."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="list">
                <thead>
                  <tr>
                    <th>{view === "day" ? "Employé" : "Jour"}</th>
                    <th>Type d'absence</th>
                    <th>Horaires prévus</th>
                  </tr>
                </thead>
                <tbody>
                  {absences.map((absence) => (
                    <tr
                      key={`${absence.id}:${"date" in absence ? absence.date : ""}`}
                    >
                      <td>
                        {"date" in absence
                          ? capitalise(
                              dayLabel(absence.date as string, {
                                weekday: "long",
                                day: "numeric",
                                month: "short",
                              }),
                            )
                          : `${absence.employee.firstName} ${absence.employee.lastName}`}
                      </td>
                      <td>{absence.typeName}</td>
                      <td>
                        {absence.dayPart === "FULL_DAY" && "Toute la journée"}
                        {absence.dayPart === "HALF_DAY" && "Demi-journée"}
                        {absence.dayPart === "CUSTOM" &&
                          `${absence.startTime} – ${absence.endTime}`}
                      </td>
                    </tr>
                  ))}
                  {absences.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        Aucune absence planifiée.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {isAdmin && (
        <section className="panel">
          <h2>Tablettes</h2>
          <button onClick={registerTablet}>Enregistrer une tablette</button>
          {newToken && (
            <p className="notice">
              Tablette enregistrée. Ouvrez <code>/kiosk</code> sur la tablette
              et saisissez ce code. Il n'est affiché qu'une seule fois :
              <br />
              <code>{newToken}</code>
            </p>
          )}
        </section>
      )}
    </main>
  );
}

/**
 * The dates at the top left: shows the week, and opens a month calendar with
 * week numbers to jump to any day.
 */
function WeekPicker({
  day,
  onPick,
}: {
  day: string;
  onPick: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(day.slice(0, 7)); // YYYY-MM on display
  const box = useRef<HTMLSpanElement>(null);
  const monday = mondayOf(day);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const first = `${month}-01`;
  const start = mondayOf(first);
  // Six weeks always cover a month.
  const weeks = Array.from({ length: 6 }, (_, w) =>
    addDays(start, w * 7),
  ).filter((weekStart, w) => w === 0 || weekStart.slice(0, 7) === month);
  const shift = (months: number) => {
    const [y, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1 + months, 1));
    setMonth(next.toISOString().slice(0, 7));
  };
  const pick = (date: string) => {
    onPick(date);
    setOpen(false);
  };

  return (
    <span className="week-picker" ref={box}>
      <button
        className="dates"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setMonth(day.slice(0, 7));
          setOpen(!open);
        }}
      >
        {dayLabel(monday, { day: "numeric", month: "short" })} –{" "}
        {dayLabel(addDays(monday, 6), {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </button>
      {open && (
        <div
          className="calendar panel"
          role="dialog"
          aria-label="Choisir une date"
        >
          <div className="row">
            <button onClick={() => shift(-1)} aria-label="Mois précédent">
              ‹
            </button>
            <strong>
              {capitalise(dayLabel(first, { month: "long", year: "numeric" }))}
            </strong>
            <button onClick={() => shift(1)} aria-label="Mois suivant">
              ›
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th />
                {["lu", "ma", "me", "je", "ve", "sa", "di"].map((name) => (
                  <th key={name}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((weekStart) => (
                <tr
                  key={weekStart}
                  className={weekStart === monday ? "current" : ""}
                >
                  <th>S{weekNumber(weekStart)}</th>
                  {Array.from({ length: 7 }, (_, i) =>
                    addDays(weekStart, i),
                  ).map((date) => (
                    <td key={date}>
                      <button
                        className={[
                          date === day ? "picked" : "",
                          date === today() ? "today" : "",
                          date.slice(0, 7) === month ? "" : "other",
                        ].join(" ")}
                        onClick={() => pick(date)}
                      >
                        {Number(date.slice(8))}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button className="link" onClick={() => pick(today())}>
            Aujourd'hui
          </button>
        </div>
      )}
    </span>
  );
}
