/**
 * The window that opens when a planning card (or an empty "+") is clicked.
 * Two tabs: Shift and Absence. Saving on the other tab turns the card into
 * the other kind (the shift is removed and an absence created, or the reverse).
 */
import { shiftDefaults } from '@skellobis/labor-rules'
import { type CSSProperties, useState } from 'react'
import {
  type AbsenceCard,
  api,
  type Person,
  type PlanningWeek,
  type PopularShift,
  type ShiftCard,
} from '../api.ts'
import { capitalise, dayLabel, hours, minutesBetween } from './dates.ts'

export type EditorTarget =
  // From the view by employee the person is known; from the view by post the
  // post and service are known and the person is chosen in the editor.
  | { kind: 'new'; date: string; employee?: Person; postId?: string; service?: 'AM' | 'PM' }
  | { kind: 'shift'; shift: ShiftCard }
  | { kind: 'absence'; absence: AbsenceCard }

interface Props {
  siteId: string
  target: EditorTarget
  posts: PlanningWeek['posts']
  employees: Person[]
  /** The shifts this restaurant plans most often, as one-click templates. */
  popular: PopularShift[]
  absenceTypes: PlanningWeek['absenceTypes']
  onClose: () => void
  onSaved: () => void
}

export function CardEditor({
  siteId,
  target,
  posts,
  employees,
  popular,
  absenceTypes,
  onClose,
  onSaved,
}: Props) {
  const shift = target.kind === 'shift' ? target.shift : null
  const absence = target.kind === 'absence' ? target.absence : null
  const preset = target.kind === 'new' ? target : null
  const choosesEmployee = preset !== null && !preset.employee
  const [employeeId, setEmployeeId] = useState(
    preset ? (preset.employee?.id ?? employees[0]?.id ?? '') : (shift ?? absence!).employeeId,
  )
  const date = target.kind === 'new' ? target.date : (shift?.date ?? absence!.startDate)

  const [tab, setTab] = useState<'shift' | 'absence'>(absence ? 'absence' : 'shift')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Shift tab
  const [start, setStart] = useState(shift?.start ?? (preset?.service === 'PM' ? '18:00' : '10:00'))
  const [end, setEnd] = useState(shift?.end ?? (preset?.service === 'PM' ? '23:00' : '15:00'))
  // A new shift takes the company default for its start time: 20 minutes and
  // one meal, or none of either for a start at 12:00 or 19:00.
  const initialStart = shift?.start ?? (preset?.service === 'PM' ? '18:00' : '10:00')
  const [breakMinutes, setBreakMinutes] = useState(
    shift?.breakMinutes ?? shiftDefaults(initialStart).breakMinutes,
  )
  const [postId, setPostId] = useState(shift?.postId ?? preset?.postId ?? posts[0]?.id ?? '')
  const [service, setService] = useState<'AM' | 'PM'>(shift?.service ?? preset?.service ?? 'AM')
  const [meals, setMeals] = useState(shift?.meals ?? shiftDefaults(initialStart).meals)

  /** Changing the start re-applies the default break and meals for that time. */
  const changeStart = (time: string) => {
    setStart(time)
    const defaults = shiftDefaults(time)
    setBreakMinutes(defaults.breakMinutes)
    setMeals(defaults.meals)
  }
  const [shiftNote, setShiftNote] = useState(shift?.note ?? '')

  // Absence tab
  const [absenceTypeId, setAbsenceTypeId] = useState(
    absence?.absenceTypeId ?? absenceTypes[0]?.id ?? '',
  )
  const [dayPart, setDayPart] = useState(absence?.dayPart ?? 'FULL_DAY')
  const [startDate, setStartDate] = useState(absence?.startDate ?? date)
  const [endDate, setEndDate] = useState(absence?.endDate ?? date)
  const [startTime, setStartTime] = useState(absence?.startTime ?? '10:00')
  const [endTime, setEndTime] = useState(absence?.endTime ?? '15:00')
  const [absenceNote, setAbsenceNote] = useState(absence?.note ?? '')

  /** Fills the form from a popular shift; everything stays editable. */
  const useTemplate = (template: PopularShift) => {
    setStart(template.start)
    setEnd(template.end)
    setBreakMinutes(template.breakMinutes)
    setMeals(template.meals)
    setPostId(template.postId)
    setService(template.service)
  }
  // Opened from a post's row: that post's usual shifts come first.
  const templates = [...popular]
    .sort(
      (a, b) =>
        Number(b.postId === preset?.postId && b.service === preset?.service) -
        Number(a.postId === preset?.postId && a.service === preset?.service),
    )
    .slice(0, 6)

  const post = posts.find((candidate) => candidate.id === postId)
  const person = employees.find((candidate) => candidate.id === employeeId)
  const fullName = person ? `${person.firstName} ${person.lastName}` : ''
  // "Modifier le shift de Tommy Dintimille", as the title of the window.
  const title =
    tab === 'shift'
      ? `${shift ? 'Modifier le shift de' : 'Ajouter un shift pour'} ${fullName}`
      : `${absence ? "Modifier l'absence de" : 'Ajouter une absence pour'} ${fullName}`
  const timesValid = [start, end].every((time) => TIME.test(time))
  const duration = timesValid ? Math.max(0, minutesBetween(start, end) - breakMinutes) : null
  const existing = shift ?? absence

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved()
    } catch (caught) {
      setError((caught as Error).message)
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const base = `/sites/${siteId}`
      if (tab === 'shift') {
        const body = {
          employeeId,
          postId,
          service,
          date,
          start,
          end,
          breakMinutes,
          meals,
          note: shiftNote,
        }
        if (shift) await api(`${base}/shifts/${shift.id}`, { method: 'PATCH', body })
        else await api(`${base}/shifts`, { method: 'POST', body })
        // It was an absence and becomes a shift.
        if (absence) await api(`${base}/absences/${absence.id}`, { method: 'DELETE' })
      } else {
        const body = {
          employeeId,
          absenceTypeId,
          startDate,
          endDate,
          dayPart,
          ...(dayPart === 'CUSTOM' ? { startTime, endTime } : {}),
          note: absenceNote,
        }
        if (absence) await api(`${base}/absences/${absence.id}`, { method: 'PATCH', body })
        else await api(`${base}/absences`, { method: 'POST', body })
        // It was a shift and becomes an absence.
        if (shift) await api(`${base}/shifts/${shift.id}`, { method: 'DELETE' })
      }
    })

  const remove = () =>
    run(() =>
      api(`/sites/${siteId}/${shift ? 'shifts' : 'absences'}/${existing!.id}`, {
        method: 'DELETE',
      }),
    )

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className={tab === 'shift' ? 'dialog-head shift' : 'dialog-head absence'}
          style={{ '--post': post?.color ?? '#9ca3af' } as CSSProperties}
        >
          <div className="row">
            <strong className="dialog-title">{title}</strong>
            <button onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
          <div>
            {capitalise(
              dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
            )}
          </div>
          <div className="tabs">
            <button className={tab === 'shift' ? 'active' : ''} onClick={() => setTab('shift')}>
              Shift
            </button>
            <button className={tab === 'absence' ? 'active' : ''} onClick={() => setTab('absence')}>
              Absence
            </button>
          </div>
        </header>

        {choosesEmployee && (
          <label className="dialog-body">
            Salarié
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {employees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
          </label>
        )}

        {tab === 'shift' ? (
          <div className="stack dialog-body">
            {templates.length > 0 && (
              <div className="templates">
                <span className="muted">Shifts fréquents</span>
                {templates.map((template) => (
                  <button
                    key={[template.postId, template.service, template.start, template.end, template.breakMinutes].join('|')}
                    type="button"
                    className="template"
                    style={{ '--post': template.color } as CSSProperties}
                    title={`Utilisé ${template.uses} fois · pause ${template.breakMinutes} min · ${template.meals} repas`}
                    onClick={() => useTemplate(template)}
                  >
                    <strong>
                      {template.start} – {template.end}
                    </strong>{' '}
                    {template.postName} {template.service}
                  </button>
                ))}
              </div>
            )}
            <div className="fields">
              <label>
                Début
                <TimePicker label="Heure de début" value={start} onChange={changeStart} />
              </label>
              <label>
                Fin
                <TimePicker label="Heure de fin" value={end} onChange={setEnd} />
              </label>
              <label>
                Pause (min)
                <input
                  type="number"
                  min={0}
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Number(e.target.value))}
                />
              </label>
              <label>
                Durée du shift
                <output>{duration === null ? '—' : hours(duration)}</output>
              </label>
            </div>
            <div className="fields">
              <label>
                Poste
                <select value={postId} onChange={(e) => setPostId(e.target.value)}>
                  {posts.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Service
                <select value={service} onChange={(e) => setService(e.target.value as 'AM' | 'PM')}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </label>
              <label>
                Repas pris
                <input
                  type="number"
                  min={0}
                  value={meals}
                  onChange={(e) => setMeals(Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              Note
              <textarea value={shiftNote} onChange={(e) => setShiftNote(e.target.value)} rows={2} />
            </label>
          </div>
        ) : (
          <div className="stack dialog-body">
            <label>
              Type d'absence
              <select value={absenceTypeId} onChange={(e) => setAbsenceTypeId(e.target.value)}>
                {absenceTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="fields">
              <label>
                Du
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label>
                Au
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
            <fieldset>
              <legend>Durée</legend>
              {(
                [
                  ['FULL_DAY', 'Toute la journée'],
                  ['HALF_DAY', 'Demi-journée'],
                  ['CUSTOM', 'Personnaliser'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="radio">
                  <input
                    type="radio"
                    name="dayPart"
                    checked={dayPart === value}
                    onChange={() => setDayPart(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {dayPart === 'CUSTOM' && (
              <div className="fields">
                <label>
                  De
                  <TimePicker label="Début de l'absence" value={startTime} onChange={setStartTime} />
                </label>
                <label>
                  À
                  <TimePicker label="Fin de l'absence" value={endTime} onChange={setEndTime} />
                </label>
              </div>
            )}
            <label>
              Note
              <textarea value={absenceNote} onChange={(e) => setAbsenceNote(e.target.value)} rows={2} />
            </label>
          </div>
        )}

        {error && <p className="error dialog-body">{error}</p>}

        <footer className="row dialog-body">
          {existing ? (
            <button className="danger" onClick={remove} disabled={busy}>
              Supprimer
            </button>
          ) : (
            <span />
          )}
          <span>
            <button onClick={onClose}>Annuler</button>{' '}
            <button className="primary" onClick={save} disabled={busy}>
              {existing ? 'Mettre à jour' : 'Ajouter'}
            </button>
          </span>
        </footer>
      </div>
    </div>
  )
}

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** "1630", "16h30" or "9:5" typed by hand become "16:30" / "09:05". */
function tidyTime(text: string): string {
  const digits = text.replace(/\D/g, '')
  const parts = text.split(/[^\d]+/).filter(Boolean)
  const [h, m] =
    parts.length >= 2
      ? [parts[0], parts[1]]
      : digits.length <= 2
        ? [digits, '0']
        : [digits.slice(0, -2), digits.slice(-2)]
  const tidy = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  return TIME.test(tidy) ? tidy : text
}

/**
 * A 24-hour time field. The browser's own time picker follows the language of
 * the computer and may show AM / PM, so a plain text field is used instead.
 */
export function TimeField({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:MM"
      maxLength={5}
      className={TIME.test(value) ? 'time' : 'time invalid'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => onChange(tidyTime(event.target.value))}
    />
  )
}

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const MINUTE_STEPS = Array.from({ length: 12 }, (_, step) => String(step * 5).padStart(2, '0'))

/**
 * Hours and minutes chosen from two lists, always on 24 hours. Minutes go by
 * five; a shift already saved with other minutes keeps them in the list.
 */
export function TimePicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (time: string) => void
  label: string
}) {
  const [hour, minute] = TIME.test(value) ? value.split(':') : ['10', '00']
  const minutes = [...new Set([...MINUTE_STEPS, minute])].sort()
  return (
    <span className="time-picker" role="group" aria-label={label}>
      <select
        aria-label={`${label}, heures`}
        value={hour}
        onChange={(event) => onChange(`${event.target.value}:${minute}`)}
      >
        {HOURS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select
        aria-label={`${label}, minutes`}
        value={minute}
        onChange={(event) => onChange(`${hour}:${event.target.value}`)}
      >
        {minutes.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </span>
  )
}
