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
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router'
import {
  type AbsenceCard,
  api,
  type Department,
  type LockStatus,
  type MissingPost,
  type PlanningRow,
  type PlanningWeek,
  type PopularShift,
  type ShiftCard,
} from '../api.ts'
import { CardEditor, type EditorTarget } from './CardEditor.tsx'
import { alertText } from './alertText.ts'
import { FillGap } from './FillGap.tsx'
import { NeedsDialog } from './NeedsDialog.tsx'
import {
  addDays,
  addMonths,
  capitalise,
  dayLabel,
  decimalHours,
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

/** A shift as sent to the server. */
interface ShiftBody {
  employeeId: string
  postId: string
  service: 'AM' | 'PM'
  date: string
  start: string
  end: string
  breakMinutes: number
  meals: number
  note?: string
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
  // The shifts this restaurant plans most often, offered as templates.
  const [popular, setPopular] = useState<PopularShift[]>([])
  const [needsOpen, setNeedsOpen] = useState(false)
  // A missing post being filled from the list of suggestions.
  const [filling, setFilling] = useState<MissingPost | null>(null)
  // While dragging: the cell under the pointer, and whether the pointer has
  // left the planning (where dropping deletes the shift).
  const [hoverCell, setHoverCell] = useState<string | null>(null)
  const [outside, setOutside] = useState(false)
  // A shift just deleted by dragging it out, which can still be put back.
  const [undo, setUndo] = useState<ShiftBody | null>(null)

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

  const loadPopular = useCallback(() => {
    api<PopularShift[]>(`/sites/${siteId}/popular-shifts`)
      .then(setPopular)
      .catch(() => setPopular([]))
  }, [siteId])
  useEffect(loadPopular, [loadPopular])

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

  /** The shift as the server expects it, placed on a target cell. */
  const bodyFor = (source: ShiftCard, target: DropTarget): ShiftBody => ({
    employeeId: target.employeeId ?? source.employeeId,
    postId: target.postId ?? source.postId,
    service: target.service ?? source.service,
    date: target.date,
    start: source.start,
    end: source.end,
    breakMinutes: source.breakMinutes,
    meals: source.meals,
    note: source.note ?? undefined,
  })

  /** True when the target is the cell the shift already sits in. */
  const isOrigin = (source: ShiftCard, target: DropTarget) =>
    target.date === source.date &&
    (target.employeeId ?? source.employeeId) === source.employeeId &&
    (target.postId ?? source.postId) === source.postId &&
    (target.service ?? source.service) === source.service

  const endDrag = () => {
    setDragged(null)
    setHoverCell(null)
    setOutside(false)
  }

  /** Dropped on one of the two zones of a cell: move it there, or copy it there. */
  async function dropOn(action: 'move' | 'duplicate', target: DropTarget) {
    const source = dragged
    endDrag()
    if (!source) return
    try {
      if (action === 'move') {
        await api(`/sites/${siteId}/shifts/${source.id}`, {
          method: 'PATCH',
          body: bodyFor(source, target),
        })
      } else {
        await api(`/sites/${siteId}/shifts`, { method: 'POST', body: bodyFor(source, target) })
      }
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  /** Dropped outside the planning: the shift is deleted, and can be put back. */
  const dropOutside = useCallback(
    async (source: ShiftCard) => {
      try {
        await api(`/sites/${siteId}/shifts/${source.id}`, { method: 'DELETE' })
        setUndo({
          employeeId: source.employeeId,
          postId: source.postId,
          service: source.service,
          date: source.date,
          start: source.start,
          end: source.end,
          breakMinutes: source.breakMinutes,
          meals: source.meals,
          note: source.note ?? undefined,
        })
        load()
      } catch (caught) {
        setError((caught as Error).message)
      }
    },
    [siteId, load],
  )

  // While a shift is dragged, everything outside the planning table is a
  // place to drop it for deletion.
  useEffect(() => {
    if (!dragged) return
    const inPlanning = (event: Event) =>
      event.target instanceof Element && event.target.closest('table.planning') !== null
    const onOver = (event: globalThis.DragEvent) => {
      const out = !inPlanning(event)
      setOutside(out)
      if (out) {
        event.preventDefault() // allows the drop
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
        setHoverCell(null)
      }
    }
    const onDrop = (event: globalThis.DragEvent) => {
      if (inPlanning(event)) return
      event.preventDefault()
      const source = dragged
      setDragged(null)
      setHoverCell(null)
      setOutside(false)
      dropOutside(source)
    }
    document.addEventListener('dragover', onOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [dragged, dropOutside])

  // The "put it back" offer disappears by itself.
  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 8_000)
    return () => clearTimeout(timer)
  }, [undo])

  async function putBack() {
    const body = undo
    setUndo(null)
    if (!body) return
    try {
      await api(`/sites/${siteId}/shifts`, { method: 'POST', body })
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
      // A shift with a note shows it on hover; the others get the usual summary.
      title={
        card.note
          ? undefined
          : `${card.start} – ${card.end} · ${card.postName} ${card.service} · ${decimalHours(card.minutes)}`
      }
      data-note={card.note ?? undefined}
      // Those who may only look get the same card, without the actions.
      disabled={!rights.editShifts}
      draggable={rights.editShifts}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copyMove'
        event.dataTransfer.setData('text/plain', card.id)
        setDragged(card)
      }}
      onDragEnd={endDrag}
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
            <span>{decimalHours(card.minutes)}</span>
          </span>
          {label}
        </>
      )}
      {card.note && (
        <span className="note-mark" aria-label={`Note : ${card.note}`}>
          ✎
        </span>
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
          <span className="row">
            <strong>
              {absence.dayPart === 'CUSTOM'
                ? `${absence.startTime} – ${absence.endTime}`
                : absence.dayPart === 'HALF_DAY'
                  ? 'Demi-journée'
                  : 'Journée'}
            </strong>
            {/* A fifth of the contract: 7h on 35 hours, 7.8h on 39. */}
            {absence.dayMinutes !== null && <span>{decimalHours(absence.dayMinutes)}</span>}
          </span>
          {absence.typeName}
        </>
      )}
    </button>
  )

  /**
   * A day cell. While a shift is dragged over it, the cell splits in two:
   * dropping on the left moves the shift here, on the right duplicates it.
   */
  const cell = (target: DropTarget, children: ReactNode) => {
    const key = `${target.employeeId ?? `${target.postId}${target.service}`}:${target.date}`
    const accepts = dragged !== null && !isOrigin(dragged, target)
    const canAdd = rights.editShifts || rights.editAbsences
    const addTarget: EditorTarget = target.employeeId
      ? {
          kind: 'new',
          date: target.date,
          employee: data.rows.find((row) => row.employee.id === target.employeeId)!.employee,
        }
      : { kind: 'new', date: target.date, postId: target.postId, service: target.service }
    const zone = (action: 'move' | 'duplicate', label: string) => (
      <div
        className={`drop-zone ${action}`}
        onDragOver={(event: DragEvent) => {
          event.preventDefault() // allows the drop
          event.dataTransfer.dropEffect = action === 'move' ? 'move' : 'copy'
        }}
        onDragEnter={(event: DragEvent) => event.currentTarget.classList.add('over')}
        onDragLeave={(event: DragEvent) => event.currentTarget.classList.remove('over')}
        onDrop={(event: DragEvent) => {
          event.preventDefault()
          event.stopPropagation()
          dropOn(action, target)
        }}
      >
        {label}
      </div>
    )
    return (
      <td
        key={target.date}
        className={[isMonday(target.date) ? 'week-start' : '', canAdd ? 'can-add' : ''].join(' ')}
        onDragOver={() => {
          if (accepts && hoverCell !== key) setHoverCell(key)
        }}
        // Clicking the empty part of a day adds a shift there. On a touch
        // screen, where nothing hovers, it is the way to add one.
        onClick={(event) => {
          if (canAdd && event.target === event.currentTarget) setEditing(addTarget)
        }}
      >
        {children}
        {accepts && hoverCell === key && (
          <div className="drop-zones">
            {zone('move', 'Déplacer')}
            {zone('duplicate', 'Dupliquer')}
          </div>
        )}
      </td>
    )
  }

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
        {!month && <WeekAlerts rows={data.rows} />}
        {!month && (
          <MissingPosts
            missing={data.missing}
            onFill={rights.editShifts ? setFilling : undefined}
          />
        )}
        {!month && rights.needs && <button onClick={() => setNeedsOpen(true)}>Besoins</button>}

        {!month && data.publication && (
          <Publication
            publication={data.publication}
            mayPublish={rights.publish}
            missing={data.missing}
            onFill={rights.editShifts ? setFilling : undefined}
            onChange={setPublished}
          />
        )}

        {rights.editShifts ? (
          <span
            className="chip help"
            title="Glissez un shift : sur une case pour le déplacer ou le dupliquer, hors du planning pour le supprimer."
          >
            ?
          </span>
        ) : (
          <span className="chip">Consultation seule</span>
        )}
      </div>

      {error && <p className="error">{error}</p>}

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
                    <span className="who">
                      {row.employee.firstName} {row.employee.lastName}
                    </span>
                    <span className="muted">
                      {row.contractMinutes === null
                        ? 'Forfait jours'
                        : `${hours(row.contractMinutes)} / sem.`}
                    </span>
                    {row.alerts.length > 0 && (
                      <AlertPop label={`⚠ ${row.alerts.length}`} name="Alertes de la semaine">
                        {row.alerts.map((alert, index) => (
                          <li key={index}>{alertText(alert)}</li>
                        ))}
                      </AlertPop>
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
                  <td
                    className="total"
                    title={
                      row.absenceMinutes > 0
                        ? `${hours(row.plannedMinutes)} de shifts + ${hours(row.absenceMinutes)} de congé payé`
                        : undefined
                    }
                  >
                    <strong>{hours(row.plannedMinutes + row.absenceMinutes)}</strong>
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

      {/* While dragging: a reminder that leaving the planning deletes. */}
      {dragged && (
        <div className={outside ? 'bin-bar active' : 'bin-bar'} aria-live="polite">
          {outside
            ? 'Relâchez pour supprimer ce shift'
            : 'Sortez du planning pour supprimer ce shift'}
        </div>
      )}

      {undo && (
        <div className="toast" role="status">
          Shift supprimé.
          <button onClick={putBack}>Annuler la suppression</button>
        </div>
      )}

      {editing && (
        <CardEditor
          siteId={siteId}
          target={editing}
          posts={data.posts}
          employees={data.rows.map((row) => row.employee)}
          popular={popular}
          absenceTypes={data.absenceTypes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
            loadPopular()
          }}
        />
      )}

      {filling && (
        <FillGap
          siteId={siteId}
          gap={filling}
          onClose={() => setFilling(null)}
          onFilled={() => {
            load()
            loadPopular()
          }}
        />
      )}

      {needsOpen && (
        <NeedsDialog
          siteId={siteId}
          siteName={data.site.name}
          posts={data.posts}
          onClose={() => setNeedsOpen(false)}
          onSaved={() => {
            setNeedsOpen(false)
            load()
          }}
        />
      )}
    </main>
  )
}

const DEPARTMENT_NAMES: Record<Department, string> = { KITCHEN: 'Cuisine', SALLE: 'Salle' }

/**
 * The publication of the week, as one menu. Its colour gives the state at a
 * glance: orange when nothing is published, blue when one department is,
 * green when both are. Inside, each department is a blue button to publish
 * it, which becomes a grey "publiée" box once done.
 */
function Publication({
  publication,
  mayPublish,
  missing,
  onFill,
  onChange,
}: {
  publication: Record<Department, string | null>
  mayPublish: Department[]
  missing: MissingPost[]
  onFill?: (gap: MissingPost) => void
  onChange: (departments: Department[], published: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const departments: Department[] = ['SALLE', 'KITCHEN']
  const published = departments.filter((department) => publication[department])
  const pending = mayPublish.filter((department) => !publication[department])
  const state = published.length === 2 ? 'all' : published.length === 1 ? 'partial' : 'none'
  const label = { all: 'Publié', partial: 'Partiellement publié', none: 'Non publié' }[state]

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="publish" ref={box}>
      <button
        className={`publish-toggle ${state}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="publish-menu" role="menu">
          <p className="muted">
            Les salariés ne voient un shift qu'une fois sa partie du planning publiée.
          </p>
          {/* A warning, not a block: publishing stays possible. */}
          {missing.length > 0 && (
            <div className="publish-warning">
              <strong>
                ⚠ {missing.length} poste{missing.length > 1 ? 's' : ''} manquant
                {missing.length > 1 ? 's' : ''} par rapport aux besoins
              </strong>
              <MissingList
                missing={missing}
                onFill={
                  onFill &&
                  ((gap) => {
                    setOpen(false)
                    onFill(gap)
                  })
                }
              />
            </div>
          )}
          {departments.map((department) => {
            const name = DEPARTMENT_NAMES[department]
            const at = publication[department]
            const allowed = mayPublish.includes(department)
            if (at) {
              return (
                <div key={department} className="publish-row">
                  <span className="publish-done">{name} publiée</span>
                  {allowed && (
                    <button className="quiet" onClick={() => onChange([department], false)}>
                      Dépublier
                    </button>
                  )}
                </div>
              )
            }
            return (
              <div key={department} className="publish-row">
                {allowed ? (
                  <button className="publish-go" onClick={() => onChange([department], true)}>
                    Publier la {name.toLowerCase()}
                  </button>
                ) : (
                  <span className="publish-waiting">{name} non publiée</span>
                )}
              </div>
            )
          })}
          {/* Someone who may publish both gets one button for the whole week. */}
          {pending.length === 2 && (
            <div className="publish-row">
              <button className="publish-go whole" onClick={() => onChange(pending, true)}>
                Publier toute la semaine
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The missing posts, grouped by day: "sam. 21 nov. · soir : Bar 0/1".
 * With `onFill`, a missing post is a button that opens the suggestions; a
 * department total stays plain text, since it names no post to fill.
 */
function MissingList({
  missing,
  onFill,
}: {
  missing: MissingPost[]
  onFill?: (gap: MissingPost) => void
}) {
  const days = [...new Set(missing.map((line) => line.date))]
  return (
    <ul className="missing-list">
      {days.map((date) => (
        <li key={date}>
          <strong>{dayLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
          {(['AM', 'PM'] as const).map((service) => {
            const lines = missing.filter((line) => line.date === date && line.service === service)
            if (lines.length === 0) return null
            return (
              <span key={service} className="missing-service">
                {' '}
                · {service === 'AM' ? 'midi' : 'soir'} :{' '}
                {lines.map((line) =>
                  onFill && line.postId ? (
                    <button
                      key={line.label}
                      className="missing-fill"
                      title="Voir qui peut prendre ce poste"
                      onClick={() => onFill(line)}
                    >
                      {line.label} {line.planned}/{line.needed} · Combler
                    </button>
                  ) : (
                    <span key={line.label} className="missing-plain">
                      {line.label} {line.planned}/{line.needed}
                    </span>
                  ),
                )}
              </span>
            )
          })}
        </li>
      ))}
    </ul>
  )
}

/** Posts short of the restaurant's needs, behind one chip in the toolbar. */
function MissingPosts({
  missing,
  onFill,
}: {
  missing: MissingPost[]
  onFill?: (gap: MissingPost) => void
}) {
  if (missing.length === 0) return null
  return (
    <AlertPop
      label={`⚠ ${missing.length} poste${missing.length > 1 ? 's' : ''} manquant${missing.length > 1 ? 's' : ''}`}
      name="Postes manquants par rapport aux besoins"
    >
      <MissingList missing={missing} onFill={onFill} />
    </AlertPop>
  )
}

/** All the week's alerts behind one chip in the toolbar. */
function WeekAlerts({ rows }: { rows: PlanningRow[] }) {
  const concerned = rows.filter((row) => row.alerts.length > 0)
  const count = concerned.reduce((total, row) => total + row.alerts.length, 0)
  if (count === 0) return null
  return (
    <AlertPop
      label={`⚠ ${count} alerte${count > 1 ? 's' : ''}`}
      name="Alertes de la semaine — à vérifier, sans bloquer"
    >
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
    </AlertPop>
  )
}

/**
 * An alert count that shows its list at once when hovered, and keeps it open
 * when clicked (click again, click elsewhere or press Escape to close).
 */
function AlertPop({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [place, setPlace] = useState<CSSProperties>({})
  const anchor = useRef<HTMLSpanElement>(null)
  const open = hovered || pinned

  // The list is placed against the window, so the table never clips it.
  const locate = () => {
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    setPlace({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 368)),
      top: Math.min(rect.bottom + 4, window.innerHeight - 120),
    })
  }

  useEffect(() => {
    if (!pinned) return
    const onClick = (event: MouseEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setPinned(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setPinned(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [pinned])

  return (
    <span
      className="alert-pop"
      ref={anchor}
      onMouseEnter={() => {
        locate()
        setHovered(true)
      }}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={pinned ? 'alert-badge pinned' : 'alert-badge'}
        aria-expanded={open}
        aria-label={`${name} : ${label.replace('⚠', '').trim()}`}
        onClick={() => {
          locate()
          setPinned(!pinned)
        }}
      >
        {label}
      </button>
      {open && (
        <span className="alert-list" role="dialog" aria-label={name} style={place}>
          <strong>{name}</strong>
          <ul>{children}</ul>
        </span>
      )}
    </span>
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
