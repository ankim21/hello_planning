/**
 * Planning of one site. The same shifts can be looked at three ways:
 *   - week, by employee: a row per person, with their weekly counter;
 *   - week, by post: a row per post and service (Pass AM, Pass PM…);
 *   - month, by employee: compact cards, hours and number of shifts per person.
 * Dragging a shift onto another cell duplicates it there.
 *
 * All the numbers (hours, counters, recaps) come from the server; this page
 * only displays them and sends the planner's changes.
 */
import {
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { Link, useParams } from 'react-router'
import {
  type AbsenceCard,
  api,
  type Department,
  type LockStatus,
  type PlanningAlert,
  type PlanningRow,
  type PlanningWeek,
  type ShiftCard,
} from '../api.ts'
import { CardEditor, type EditorTarget } from './CardEditor.tsx'
import {
  addDays,
  addMonths,
  capitalise,
  dayLabel,
  daysInMonth,
  firstOfMonth,
  hours,
  isMonday,
  mondayOf,
  today,
  weekNumber,
} from './dates.ts'
import { Shell } from './Shell.tsx'

const LOCK_LABELS: Record<LockStatus, string> = {
  OPEN: 'Ouvert',
  LOCKED: 'Verrouillé',
  PAYROLL: 'Comptabilisé pour la paie',
}

/** Where a dragged shift is dropped: a day, plus what the row stands for. */
interface DropTarget {
  date: string
  employeeId?: string // rows are employees
  postId?: string // rows are posts
  service?: 'AM' | 'PM'
}

export function Planning() {
  const { siteId } = useParams()
  return (
    <Shell siteId={siteId} section="planning">
      {/* The key resets the page when another site is chosen in the menu. */}
      {() => <Board key={siteId} siteId={siteId!} />}
    </Shell>
  )
}

function Board({ siteId }: { siteId: string }) {
  // `anchor` is any day inside the period shown.
  const [anchor, setAnchor] = useState(today)
  const [span, setSpan] = useState<'week' | 'month'>('week')
  const [view, setView] = useState<'employees' | 'posts'>('employees')
  const [data, setData] = useState<PlanningWeek | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditorTarget | null>(null)
  const [lockMenu, setLockMenu] = useState<string | null>(null)
  const [dragged, setDragged] = useState<ShiftCard | null>(null)

  const month = span === 'month'
  const from = month ? firstOfMonth(anchor) : mondayOf(anchor)
  const length = month ? daysInMonth(anchor) : 7
  const byPost = !month && view === 'posts'

  const load = useCallback(() => {
    api<PlanningWeek>(`/sites/${siteId}/planning?from=${from}&days=${length}`)
      .then((result) => {
        setData(result)
        setError(null)
      })
      .catch((caught) => setError((caught as Error).message))
  }, [siteId, from, length])

  useEffect(load, [load])

  const move = (direction: 1 | -1) =>
    setAnchor(month ? addMonths(anchor, direction) : addDays(anchor, 7 * direction))

  async function setLock(date: string, status: LockStatus) {
    setLockMenu(null)
    try {
      await api(`/sites/${siteId}/days/${date}/lock`, { method: 'PUT', body: { status } })
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  /** Shows kitchen and/or salle to the staff for this week, or hides them again. */
  async function setPublished(departments: Department[], published: boolean) {
    try {
      for (const department of departments) {
        await api(`/sites/${siteId}/weeks/${from}/publication`, {
          method: 'PUT',
          body: { department, published },
        })
      }
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  /** Copies the dragged shift to the cell it was dropped on. */
  async function duplicate(target: DropTarget) {
    const source = dragged
    setDragged(null)
    if (!source) return
    const copy = {
      employeeId: target.employeeId ?? source.employeeId,
      postId: target.postId ?? source.postId,
      service: target.service ?? source.service,
      date: target.date,
      start: source.start,
      end: source.end,
      breakMinutes: source.breakMinutes,
      meals: source.meals,
      note: source.note ?? undefined,
    }
    // Dropped back where it came from: nothing to copy.
    const unchanged =
      copy.date === source.date &&
      copy.employeeId === source.employeeId &&
      copy.postId === source.postId &&
      copy.service === source.service
    if (unchanged) return
    try {
      await api(`/sites/${siteId}/shifts`, { method: 'POST', body: copy })
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  if (!data) return <main className="wide">{error && <p className="error">{error}</p>}</main>

  const { rights } = data
  const allShifts = data.rows.flatMap((row) => row.shifts)
  const nameOf = (employeeId: string) => {
    const person = data.rows.find((row) => row.employee.id === employeeId)?.employee
    return person ? `${person.firstName} ${person.lastName}` : ''
  }

  /** A shift card; `label` is what the second line says in the current view. */
  const shiftCard = (card: ShiftCard, label: string) => (
    <button
      key={card.id}
      className={`card shift ${card.service}`}
      style={{ '--post': card.color } as CSSProperties}
      title={`${card.start} – ${card.end} · ${card.postName} ${card.service} · ${hours(card.minutes)}`}
      // Those who may only look get the same card, without the actions.
      disabled={!rights.editShifts}
      draggable={rights.editShifts}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData('text/plain', card.id)
        setDragged(card)
      }}
      onDragEnd={() => setDragged(null)}
      onClick={() => setEditing({ kind: 'shift', shift: card })}
    >
      {month ? (
        <>
          <strong>{card.start}</strong>
          <strong>{card.end}</strong>
        </>
      ) : (
        <>
          <span className="row">
            <strong>
              {card.start} – {card.end}
            </strong>
            <span>{hours(card.minutes)}</span>
          </span>
          {label}
        </>
      )}
    </button>
  )

  const absenceCard = (absence: AbsenceCard) => (
    <button
      key={absence.id}
      className="card absence"
      title={absence.typeName}
      disabled={!rights.editAbsences}
      onClick={() => setEditing({ kind: 'absence', absence })}
    >
      {month ? (
        <strong>{absence.typeName.slice(0, 5)}.</strong>
      ) : (
        <>
          <strong>
            {absence.dayPart === 'CUSTOM'
              ? `${absence.startTime} – ${absence.endTime}`
              : absence.dayPart === 'HALF_DAY'
                ? 'Demi-journée'
                : 'Journée'}
          </strong>
          {absence.typeName}
        </>
      )}
    </button>
  )

  /** A day cell that accepts a dropped shift. */
  const cell = (target: DropTarget, children: ReactNode) => (
    <td
      key={target.date}
      className={[dragged ? 'drop' : '', isMonday(target.date) ? 'week-start' : ''].join(' ')}
      onDragOver={(event: DragEvent) => {
        if (!dragged) return
        event.preventDefault() // allows the drop
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event: DragEvent) => {
        event.preventDefault()
        duplicate(target)
      }}
    >
      {children}
    </td>
  )

  const addButton = (label: string, target: EditorTarget) =>
    (rights.editShifts || rights.editAbsences) && (
    <button className="add" aria-label={label} title="Ajouter" onClick={() => setEditing(target)}>
      +
    </button>
    )

  return (
    <main className="wide">
      <div className="row toolbar">
        <span className="period">
          <button onClick={() => move(-1)} aria-label="Période précédente">
            ‹
          </button>
          <strong>
            {month
              ? capitalise(dayLabel(from, { month: 'long', year: 'numeric' }))
              : `${dayLabel(from, { day: 'numeric', month: 'short' })} – ${dayLabel(addDays(from, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </strong>
          <button onClick={() => move(1)} aria-label="Période suivante">
            ›
          </button>
          {!month && <span className="chip">Semaine {weekNumber(from)}</span>}
          <button onClick={() => setAnchor(today())}>Aujourd'hui</button>
        </span>

        <span className="segmented" role="group" aria-label="Période affichée">
          <button className={month ? '' : 'active'} onClick={() => setSpan('week')}>
            Semaine
          </button>
          <button className={month ? 'active' : ''} onClick={() => setSpan('month')}>
            Mois
          </button>
        </span>

        {/* Kitchen and salle are published separately, week by week: the
            staff see nothing of a department before it is published. */}
        {!month && data.publication && (
          <Publication
            publication={data.publication}
            mayPublish={rights.publish}
            onChange={setPublished}
          />
        )}

        <span className="muted hint">
          {rights.editShifts
            ? 'Glissez un shift sur une autre case pour le dupliquer.'
            : 'Consultation seule.'}
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      <Alerts rows={data.rows} />

      <div className="planning-scroll panel">
        <table
          className={month ? 'planning month' : 'planning'}
          style={month ? { minWidth: 260 + length * 46 } : undefined}
        >
          <thead>
            <tr>
              <th>
                {month ? (
                  'Employés'
                ) : (
                  <span className="tabs view-tabs">
                    <button
                      className={view === 'employees' ? 'active' : ''}
                      onClick={() => setView('employees')}
                    >
                      Employés
                    </button>
                    <button
                      className={view === 'posts' ? 'active' : ''}
                      onClick={() => setView('posts')}
                    >
                      Postes
                    </button>
                  </span>
                )}
              </th>
              {data.days.map((day) => (
                <th
                  key={day.date}
                  className={[
                    day.date === today() ? 'today' : '',
                    isMonday(day.date) ? 'week-start' : '',
                  ].join(' ')}
                >
                  {month ? (
                    <>
                      <span className="muted">{dayLabel(day.date, { weekday: 'short' })}</span>
                      <span className="day-number">{Number(day.date.slice(8))}</span>
                    </>
                  ) : (
                    capitalise(
                      dayLabel(day.date, { weekday: 'short', day: 'numeric', month: 'short' }),
                    )
                  )}
                  <span className="lock-wrap">
                    <button
                      className={`lock lock-${day.lock}`}
                      title={LOCK_LABELS[day.lock]}
                      aria-label={`${day.date} : ${LOCK_LABELS[day.lock]}`}
                      disabled={!rights.lock}
                      onClick={() => setLockMenu(lockMenu === day.date ? null : day.date)}
                    >
                      <LockIcon closed={day.lock !== 'OPEN'} />
                    </button>
                    {lockMenu === day.date && (
                      <span className="lock-menu">
                        {(Object.keys(LOCK_LABELS) as LockStatus[]).map((status) => (
                          <button
                            key={status}
                            disabled={status === day.lock}
                            onClick={() => setLock(day.date, status)}
                          >
                            <span className={`lock lock-${status}`}>
                              <LockIcon closed={status !== 'OPEN'} />
                            </span>{' '}
                            {LOCK_LABELS[status]}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              <th>Total</th>
            </tr>
          </thead>

          {byPost ? (
            <tbody>
              {postRows(data).map(({ post, service }) => {
                const ofRow = allShifts.filter(
                  (shift) => shift.postId === post.id && shift.service === service,
                )
                return (
                  <tr key={post.id + service}>
                    <th className="employee">
                      <span className="dot" style={{ background: post.color }} /> {post.name}{' '}
                      {service}
                    </th>
                    {data.days.map((day) => {
                      const ofCell = ofRow.filter((shift) => shift.date === day.date)
                      return cell(
                        { date: day.date, postId: post.id, service },
                        <>
                          {ofCell.map((shift) => shiftCard(shift, nameOf(shift.employeeId)))}
                          {addButton(`Ajouter sur ${post.name} ${service}, ${day.date}`, {
                            kind: 'new',
                            date: day.date,
                            postId: post.id,
                            service,
                          })}
                          <span className="cell-recap muted">
                            <span>
                              {new Set(ofCell.map((shift) => shift.employeeId)).size} pers.
                            </span>
                            <span>{hours(sum(ofCell))}</span>
                          </span>
                        </>,
                      )
                    })}
                    <td className="total">
                      <strong>{hours(sum(ofRow))}</strong>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          ) : (
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.employee.id}>
                  <th className="employee">
                    {row.employee.firstName} {row.employee.lastName}
                    <span className="muted">
                      {row.contractMinutes === null
                        ? 'Forfait jours'
                        : `${hours(row.contractMinutes)} / sem.`}
                    </span>
                    {row.alerts.length > 0 && (
                      <span
                        className="alert-badge"
                        title={row.alerts.map(alertText).join('\n')}
                      >
                        ⚠ {row.alerts.length} alerte{row.alerts.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </th>
                  {data.days.map((day) =>
                    cell(
                      { date: day.date, employeeId: row.employee.id },
                      <>
                        {absencesOf(row, day.date).map(absenceCard)}
                        {row.requests
                          .filter((r) => r.startDate <= day.date && day.date <= r.endDate)
                          .map((request) => (
                            <Link
                              key={request.id}
                              to="/demandes"
                              className="card request-card"
                              title={`Demande en attente : ${request.typeName}`}
                            >
                              {month ? (
                                <strong>?</strong>
                              ) : (
                                <>
                                  <strong>Demande en attente</strong>
                                  {request.typeName}
                                </>
                              )}
                            </Link>
                          ))}
                        {row.shifts
                          .filter((shift) => shift.date === day.date)
                          .map((shift) => shiftCard(shift, `${shift.postName} ${shift.service}`))}
                        {addButton(`Ajouter pour ${row.employee.firstName}, ${day.date}`, {
                          kind: 'new',
                          employee: row.employee,
                          date: day.date,
                        })}
                      </>,
                    ),
                  )}
                  <td className="total">
                    <strong>{hours(row.plannedMinutes)}</strong>
                    {month ? (
                      <span className="muted">
                        {row.shifts.length} shift{row.shifts.length > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <Difference minutes={row.differenceMinutes} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          )}

          <tfoot>
            <tr>
              <th>Heures planifiées</th>
              {data.days.map((day) => (
                <td key={day.date} className={isMonday(day.date) ? 'week-start' : ''}>
                  {month ? (
                    hours(day.minutes)
                  ) : (
                    <>
                      {day.people} pers. · <strong>{hours(day.minutes)}</strong>
                    </>
                  )}
                </td>
              ))}
              <td className="total">
                <strong>{hours(data.totalMinutes)}</strong>
                {month && (
                  <span className="muted">
                    {allShifts.length} shift{allShifts.length > 1 ? 's' : ''}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editing && (
        <CardEditor
          siteId={siteId}
          target={editing}
          posts={data.posts}
          employees={data.rows.map((row) => row.employee)}
          absenceTypes={data.absenceTypes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </main>
  )
}

const DEPARTMENT_LABELS: Record<Department, string> = { KITCHEN: 'la cuisine', SALLE: 'la salle' }

/** The publication state of the week, and the buttons this person may use. */
function Publication({
  publication,
  mayPublish,
  onChange,
}: {
  publication: Record<Department, string | null>
  mayPublish: Department[]
  onChange: (departments: Department[], published: boolean) => void
}) {
  const departments: Department[] = ['SALLE', 'KITCHEN']
  const published = departments.filter((department) => publication[department])
  const pending = mayPublish.filter((department) => !publication[department])
  const state =
    published.length === 2
      ? 'Publié'
      : published.length === 1
        ? `Partiellement publié : ${DEPARTMENT_LABELS[published[0]]} seulement`
        : 'Non publié — invisible pour les salariés'
  return (
    <span className="period">
      <span className={published.length === 2 ? 'chip published' : 'chip draft'}>{state}</span>
      {/* Someone who may publish both gets one button for the whole week. */}
      {pending.length === 2 && (
        <button className="primary" onClick={() => onChange(pending, true)}>
          Publier la semaine
        </button>
      )}
      {mayPublish.map((department) =>
        publication[department] ? (
          <button key={department} onClick={() => onChange([department], false)}>
            Dépublier {DEPARTMENT_LABELS[department]}
          </button>
        ) : (
          <button
            key={department}
            className={pending.length === 2 ? '' : 'primary'}
            onClick={() => onChange([department], true)}
          >
            Publier {DEPARTMENT_LABELS[department]}
          </button>
        ),
      )}
    </span>
  )
}

/** One alert, as a sentence. Alerts warn; they never block the planning. */
function alertText(alert: PlanningAlert): string {
  const day = alert.date
    ? dayLabel(alert.date, { weekday: 'long', day: 'numeric', month: 'short' })
    : ''
  switch (alert.kind) {
    case 'REST_DAYS':
      return 'Pas deux jours de repos consécutifs dans la semaine'
    case 'WEEKLY_MAX':
      return `${hours(alert.minutes ?? 0)} planifiées : plus de 46h dans la semaine`
    case 'DAILY_REST':
      return `Seulement ${hours(alert.minutes ?? 0)} de repos avant le ${day} (11h attendues)`
    case 'SHIFT_ON_ABSENCE':
      return `Shift planifié le ${day} malgré : ${alert.detail}`
  }
}

/** The week's alerts, listed above the planning. Folded when there are many. */
function Alerts({ rows }: { rows: PlanningRow[] }) {
  const concerned = rows.filter((row) => row.alerts.length > 0)
  const count = concerned.reduce((total, row) => total + row.alerts.length, 0)
  if (count === 0) return null
  return (
    <details className="alerts" open={count <= 6}>
      <summary>
        ⚠ {count} alerte{count > 1 ? 's' : ''} sur cette semaine
        <span className="muted"> — à vérifier, sans bloquer le planning</span>
      </summary>
      <ul>
        {concerned.map((row) =>
          row.alerts.map((alert, index) => (
            <li key={row.employee.id + index}>
              <strong>
                {row.employee.firstName} {row.employee.lastName}
              </strong>{' '}
              · {alertText(alert)}
            </li>
          )),
        )}
      </ul>
    </details>
  )
}

const sum = (shifts: ShiftCard[]) => shifts.reduce((total, shift) => total + shift.minutes, 0)

function absencesOf(row: PlanningRow, date: string): AbsenceCard[] {
  return row.absences.filter((absence) => absence.startDate <= date && date <= absence.endDate)
}

/** One row per post and service: all the AM rows first, then the PM rows. */
function postRows(data: PlanningWeek) {
  return (['AM', 'PM'] as const).flatMap((service) =>
    data.posts.map((post) => ({ post, service })),
  )
}

/** Over the contract in red, under it in blue, nothing when exact. */
function Difference({ minutes }: { minutes: number | null }) {
  if (minutes === null || minutes === 0) return null
  return (
    <span className={minutes > 0 ? 'over' : 'under'}>
      {minutes > 0 ? '+' : ''}
      {hours(minutes)}
    </span>
  )
}

function LockIcon({ closed }: { closed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path
        d={closed ? 'M5 7V5a3 3 0 0 1 6 0v2' : 'M5 7V5a3 3 0 0 1 6 0'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}
