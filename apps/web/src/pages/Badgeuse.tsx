/**
 * Badgeuse: one day at a site, one line per planned shift (plus clockings
 * that match no shift). Each line shows what was planned, what was clocked,
 * and the paid hours, which the manager can change before validating.
 *
 * The paid hours start from what the company rules compute. A coloured time
 * in the planned or clocked columns is the one the paid hours currently use:
 * green for the start, violet for the end, orange for the break.
 *
 * Validating stores the paid hours; the raw clockings are never changed.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api, type BadgeDay, type BadgeRow, type HoursReport, type Site } from '../api.ts'
import { TIME, TimeField } from './CardEditor.tsx'
import {
  addDays,
  capitalise,
  dayLabel,
  hours,
  minutesBetween,
  mondayOf,
  today,
  weekNumber,
} from './dates.ts'
import { Shell } from './Shell.tsx'

const FLAG_LABELS: Record<string, string> = {
  UNPLANNED: 'Sans shift prévu',
  MISSING_CLOCK_OUT: 'Départ non badgé',
  LATE_ARRIVAL: 'Arrivée en retard',
  EARLY_DEPARTURE: 'Départ anticipé',
  LATE_DEPARTURE_COUNTED: 'Départ tardif compté',
  LATE_DEPARTURE_NOT_COUNTED_COUPURE: 'Départ tardif non compté (coupure)',
  CLOCKED_BREAK_DIFFERS: 'Pause badgée différente',
}

/** The paid hours of a line, as being edited on screen. */
interface Draft {
  start: string
  end: string
  breakMinutes: number
  meals: number
  note: string
}

/** Where a line starts from: what was validated, else what the rules compute. */
function initialDraft(row: BadgeRow): Draft {
  if (row.validation) {
    const { start, end, breakMinutes, meals, reason } = row.validation
    return { start, end, breakMinutes, meals, note: reason ?? '' }
  }
  return {
    start: row.computed?.start ?? '',
    end: row.computed?.end ?? '',
    breakMinutes: row.computed?.breakMinutes ?? row.shift?.breakMinutes ?? 0,
    meals: row.shift?.meals ?? 0,
    note: '',
  }
}

const same = (a: Draft, b: Draft) =>
  a.start === b.start &&
  a.end === b.end &&
  a.breakMinutes === b.breakMinutes &&
  a.meals === b.meals &&
  a.note === b.note

const complete = (draft: Draft) => TIME.test(draft.start) && TIME.test(draft.end)

/** "il y a 3 heures" */
function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const h = Math.round(minutes / 60)
  if (h < 24) return `il y a ${h} heure${h > 1 ? 's' : ''}`
  const d = Math.round(h / 24)
  return `il y a ${d} jour${d > 1 ? 's' : ''}`
}

export function Badgeuse() {
  const { siteId } = useParams()
  return (
    <Shell siteId={siteId} section="badgeuse">
      {({ sites }) => <Day key={siteId} site={sites.find((s) => s.id === siteId)} />}
    </Shell>
  )
}

function Day({ site }: { site: Site | undefined }) {
  const [day, setDay] = useState(today)
  const [report, setReport] = useState<HoursReport | null>(null)
  const [week, setWeek] = useState<BadgeDay[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [tab, setTab] = useState<'planned' | 'absences'>('planned')
  const [error, setError] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const siteId = site?.id
  const monday = mondayOf(day)

  const load = useCallback(() => {
    if (!siteId) return
    api<HoursReport>(`/sites/${siteId}/hours?date=${day}`)
      .then((data) => {
        setReport(data)
        setDrafts({}) // back to what the server holds
        setError(null)
      })
      .catch((caught) => {
        setReport(null)
        setError((caught as Error).message)
      })
    api<BadgeDay[]>(`/sites/${siteId}/hours/week?date=${monday}`)
      .then(setWeek)
      .catch(() => setWeek([]))
  }, [siteId, day, monday])

  useEffect(load, [load])

  if (!site) {
    return (
      <main>
        <p className="error">Site introuvable.</p>
      </main>
    )
  }

  const rows = report?.rows ?? []
  // HR and the operations team look at the day without changing it.
  const canValidate = report?.canValidate ?? false
  const draftOf = (row: BadgeRow) => drafts[row.key] ?? initialDraft(row)
  const edit = (row: BadgeRow, change: Partial<Draft>) =>
    setDrafts((all) => ({ ...all, [row.key]: { ...draftOf(row), ...change } }))
  const dirty = (row: BadgeRow) => !same(draftOf(row), initialDraft(row))

  /** Saves the paid hours of one line as validated. */
  function save(row: BadgeRow) {
    const draft = draftOf(row)
    const computed = row.computed
    // "Corrected" = the manager changed what the rules computed.
    const corrected =
      !computed ||
      draft.start !== computed.start ||
      draft.end !== computed.end ||
      draft.breakMinutes !== computed.breakMinutes
    return api(`/sites/${site!.id}/time-entries`, {
      method: 'POST',
      body: {
        employeeId: row.employee.id,
        clockInAt: row.clocked?.clockInAt,
        shiftId: row.shift?.id,
        date: row.date,
        start: draft.start,
        end: draft.end,
        breakMinutes: draft.breakMinutes,
        meals: draft.meals,
        corrected,
        reason: draft.note,
      },
    })
  }

  async function change(action: () => Promise<unknown>) {
    try {
      await action()
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  /** The tick of a line: validates it, or removes the validation. */
  function toggle(row: BadgeRow) {
    if (row.validation && !dirty(row)) {
      const id = row.validation.id
      change(() => api(`/sites/${site!.id}/time-entries/${id}`, { method: 'DELETE' }))
    } else {
      change(() => save(row))
    }
  }

  const toValidate = rows.filter(
    (row) => complete(draftOf(row)) && (!row.validation || dirty(row)),
  )
  const validated = rows.filter((row) => row.validation).length
  const isAdmin = site.rights.manageTablets

  async function registerTablet() {
    const name = window.prompt(`Nom de la nouvelle tablette pour ${site!.name} ?`)
    if (!name) return
    const { token } = await api<{ token: string }>(`/sites/${site!.id}/devices`, {
      method: 'POST',
      body: { name },
    })
    setNewToken(token)
  }

  return (
    <main className="wide">
      <div className="row toolbar">
        <span className="period">
          <button onClick={() => setDay(addDays(day, -7))} aria-label="Semaine précédente">
            ‹
          </button>
          <strong>
            {dayLabel(monday, { day: 'numeric', month: 'short' })} –{' '}
            {dayLabel(addDays(monday, 6), { day: 'numeric', month: 'short', year: 'numeric' })}
          </strong>
          <button onClick={() => setDay(addDays(day, 7))} aria-label="Semaine suivante">
            ›
          </button>
          <span className="chip">Semaine {weekNumber(monday)}</span>
          <button onClick={() => setDay(today())}>Aujourd'hui</button>
        </span>
        <span className="period">
          <span className="muted hint">
            {report?.lastSyncAt
              ? `Dernier badgeage reçu ${ago(report.lastSyncAt)}`
              : 'Aucun badgeage reçu'}
          </span>
          <button
            className="primary"
            disabled={!canValidate || toValidate.length === 0}
            onClick={() => change(() => Promise.all(toValidate.map(save)))}
          >
            Valider la journée
          </button>
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="badgeuse">
        <nav className="days panel" aria-label="Jours de la semaine">
          {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => {
            const info = week.find((entry) => entry.date === date)
            const done = info !== undefined && info.rows > 0 && info.validated === info.rows
            return (
              <button
                key={date}
                className={date === day ? 'active' : ''}
                onClick={() => setDay(date)}
              >
                <span>
                  {capitalise(dayLabel(date, { weekday: 'long', day: 'numeric', month: 'short' }))}
                </span>
                <span
                  className={done ? 'tick done' : 'tick'}
                  title={info ? `${info.validated}/${info.rows} validés` : undefined}
                >
                  ✓
                </span>
              </button>
            )
          })}
        </nav>

        <section className="panel day-panel">
          <div className="segmented">
            <button className={tab === 'planned' ? 'active' : ''} onClick={() => setTab('planned')}>
              Prévus ({rows.length})
            </button>
            <button
              className={tab === 'absences' ? 'active' : ''}
              onClick={() => setTab('absences')}
            >
              Absences planifiées ({report?.absences.length ?? 0})
            </button>
          </div>

          {tab === 'planned' ? (
            <>
              <p className={validated === rows.length && rows.length > 0 ? 'banner done' : 'banner'}>
                <strong>
                  {validated}/{rows.length} shifts validés
                </strong>
                {canValidate &&
                  toValidate.length > 0 &&
                  ' — pour valider vos modifications, cliquez sur « Valider la journée ».'}
              </p>
              <div className="table-scroll">
                <table className={canValidate ? 'list badge-table' : 'list badge-table readonly'}>
                  <thead>
                    <tr>
                      <th>Validé</th>
                      <th>Employé</th>
                      <th>Shift prévu</th>
                      <th>Pause</th>
                      <th>Shift badgé</th>
                      <th>Pause</th>
                      <th>Shift rémunéré</th>
                      <th>Pause</th>
                      <th>Repas</th>
                      <th>Total</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const draft = draftOf(row)
                      const total = complete(draft)
                        ? Math.max(0, minutesBetween(draft.start, draft.end) - draft.breakMinutes)
                        : null
                      // A time is coloured when the paid hours use it.
                      const from = (time: string | null | undefined, paid: string, kind: string) =>
                        time ? (
                          <span className={time === paid ? `time ${kind}` : 'time'}>{time}</span>
                        ) : (
                          <span className="time empty">—</span>
                        )
                      return (
                        <tr key={row.key} className={row.validation && !dirty(row) ? 'validated' : ''}>
                          <td>
                            <button
                              className={row.validation && !dirty(row) ? 'tick done' : 'tick'}
                              disabled={!canValidate || !complete(draft)}
                              aria-label={
                                row.validation && !dirty(row)
                                  ? `Annuler la validation de ${row.employee.firstName}`
                                  : `Valider ${row.employee.firstName}`
                              }
                              title={
                                row.validation && !dirty(row) ? 'Annuler la validation' : 'Valider'
                              }
                              onClick={() => toggle(row)}
                            >
                              ✓
                            </button>
                          </td>
                          <td className="who">
                            <strong>
                              {row.employee.firstName} {row.employee.lastName}
                            </strong>
                            <span className="muted">
                              {row.shift ? `${row.shift.post} ${row.shift.service}` : 'Sans shift prévu'}
                              {row.inProgress && ' · en poste'}
                            </span>
                            {row.computed?.flags
                              .filter((flag) => flag !== 'UNPLANNED')
                              .map((flag) => (
                                <span key={flag} className="flag">
                                  {FLAG_LABELS[flag] ?? flag}
                                </span>
                              ))}
                          </td>
                          <td>
                            {from(row.shift?.start, draft.start, 'start')} –{' '}
                            {from(row.shift?.end, draft.end, 'end')}
                          </td>
                          <td>
                            {row.shift ? (
                              <span
                                className={
                                  row.shift.breakMinutes === draft.breakMinutes ? 'time break' : 'time'
                                }
                              >
                                {row.shift.breakMinutes} mn
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {from(row.clocked?.start, draft.start, 'start')} –{' '}
                            {from(row.clocked?.end, draft.end, 'end')}
                          </td>
                          <td>{row.clocked ? `${row.clocked.breakMinutes} mn` : '—'}</td>
                          <td className="paid">
                            <TimeField value={draft.start} onChange={(start) => edit(row, { start })} />
                            {' – '}
                            <TimeField value={draft.end} onChange={(end) => edit(row, { end })} />
                          </td>
                          <td>
                            <input
                              className="small"
                              type="number"
                              min={0}
                              aria-label="Pause rémunérée en minutes"
                              value={draft.breakMinutes}
                              onChange={(e) => edit(row, { breakMinutes: Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <input
                              className="small"
                              type="number"
                              min={0}
                              aria-label="Repas"
                              value={draft.meals}
                              onChange={(e) => edit(row, { meals: Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <strong>{total === null ? '—' : hours(total)}</strong>
                          </td>
                          <td>
                            <input
                              className="note"
                              placeholder="Ajouter une note"
                              value={draft.note}
                              onChange={(e) => edit(row, { note: e.target.value })}
                            />
                          </td>
                        </tr>
                      )
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="muted">
                          Aucun shift prévu ni badgeage ce jour-là.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <ul className="plain absences">
              {report?.absences.length === 0 && (
                <li className="muted">Aucune absence planifiée ce jour-là.</li>
              )}
              {report?.absences.map((absence) => (
                <li key={absence.id}>
                  <strong>
                    {absence.employee.firstName} {absence.employee.lastName}
                  </strong>
                  {' · '}
                  {absence.typeName}
                  {absence.dayPart === 'HALF_DAY' && ' (demi-journée)'}
                  {absence.dayPart === 'CUSTOM' && ` (${absence.startTime} – ${absence.endTime})`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {isAdmin && (
        <section className="panel">
          <h2>Tablettes</h2>
          <button onClick={registerTablet}>Enregistrer une tablette</button>
          {newToken && (
            <p className="notice">
              Tablette enregistrée. Ouvrez <code>/kiosk</code> sur la tablette et saisissez ce
              code. Il n'est affiché qu'une seule fois :
              <br />
              <code>{newToken}</code>
            </p>
          )}
        </section>
      )}
    </main>
  )
}
