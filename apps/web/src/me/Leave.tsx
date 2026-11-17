/**
 * Congés: ask for days off and follow the answer.
 * Requests waiting come first, then the leave still ahead, then the past.
 */
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { api, type LeaveRequest } from '../api.ts'
import { TIME, TimeField } from '../pages/CardEditor.tsx'
import { dayLabel, nextMonday, today } from '../pages/dates.ts'
import { periodLabel, ROUTE_LABELS, StatusBadge } from '../pages/leave.tsx'
import { MeShell } from './MeShell.tsx'
import { Empty } from './parts.tsx'

export function Leave() {
  return <MeShell>{(me) => (me.employee ? <Content /> : <Navigate to="/moi/profil" replace />)}</MeShell>
}

function Content() {
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<LeaveRequest[]>('/leave/mine').then(setRequests)
  }, [])
  useEffect(load, [load])

  async function cancel(id: string) {
    setError(null)
    try {
      await api(`/leave/${id}/cancel`, { method: 'POST', body: {} })
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  const all = requests ?? []
  const waiting = all.filter((request) => request.status === 'PENDING')
  const ahead = all.filter((request) => request.status === 'APPROVED' && request.endDate >= today())
  const past = all.filter((request) => !waiting.includes(request) && !ahead.includes(request))

  const card = (request: LeaveRequest) => (
    <li key={request.id} className={`leave-card leave-${request.status}`}>
      <div className="leave-head">
        <strong>{request.typeName}</strong>
        <StatusBadge status={request.status} />
      </div>
      <span>{periodLabel(request)}</span>
      {request.status === 'PENDING' && (
        <span className="muted">Décision par {ROUTE_LABELS[request.route]}.</span>
      )}
      {request.decisionNote && <span className="muted">« {request.decisionNote} »</span>}
      {request.status === 'PENDING' && (
        <button className="link-danger" onClick={() => cancel(request.id)}>
          Annuler ma demande
        </button>
      )}
    </li>
  )

  return (
    <div className="me-single">
      <div className="me-heading">
        <h1 className="me-title">Congés</h1>
        <button className="primary" onClick={() => setAsking(true)}>
          Demander un congé
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {requests && all.length === 0 && (
        <Empty title="Aucune demande pour l'instant">
          Vos demandes de congé et leurs réponses apparaîtront ici.
        </Empty>
      )}

      {waiting.length > 0 && (
        <section>
          <h2 className="eyebrow">En attente de réponse</h2>
          <ul className="leave-list">{waiting.map(card)}</ul>
        </section>
      )}
      {ahead.length > 0 && (
        <section>
          <h2 className="eyebrow">Congés à venir</h2>
          <ul className="leave-list">{ahead.map(card)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="eyebrow">Historique</h2>
          <ul className="leave-list">{past.map(card)}</ul>
        </section>
      )}

      {asking && (
        <RequestSheet
          onClose={() => setAsking(false)}
          onSent={() => {
            setAsking(false)
            load()
          }}
        />
      )}
    </div>
  )
}

/** The request form, as a sheet that slides over the page. */
function RequestSheet({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [types, setTypes] = useState<{ id: string; name: string }[]>([])
  const [absenceTypeId, setAbsenceTypeId] = useState('')
  // Leave is asked ahead: the earliest day is next Monday.
  const earliest = nextMonday()
  const [startDate, setStartDate] = useState(earliest)
  const [endDate, setEndDate] = useState(earliest)
  const [dayPart, setDayPart] = useState<LeaveRequest['dayPart']>('FULL_DAY')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('15:00')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ id: string; name: string }[]>('/leave/types').then((list) => {
      setTypes(list)
      // "Congé payé" is the usual request, so it is offered first.
      setAbsenceTypeId((list.find((type) => type.name === 'Congé payé') ?? list[0])?.id ?? '')
    })
  }, [])

  const oneDay = startDate === endDate
  const tooEarly = startDate < earliest
  const timesValid = !oneDay || dayPart !== 'CUSTOM' || (TIME.test(startTime) && TIME.test(endTime))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/leave', {
        method: 'POST',
        body: {
          absenceTypeId,
          startDate,
          endDate,
          dayPart: oneDay ? dayPart : 'FULL_DAY',
          ...(oneDay && dayPart === 'CUSTOM' ? { startTime, endTime } : {}),
          note,
        },
      })
      onSent()
    } catch (caught) {
      setError((caught as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Demander un congé"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="sheet-head">
          <strong>Demander un congé</strong>
          <button type="button" className="round" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <p className="sheet-info">
          Les congés se demandent à l'avance, au plus tôt à partir du{' '}
          <strong>{dayLabel(earliest, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.
          Pour un empêchement cette semaine, ouvrez votre shift dans « Ma semaine » : vous y
          trouverez le numéro du responsable à appeler.
        </p>

        <label>
          Type
          <select value={absenceTypeId} onChange={(e) => setAbsenceTypeId(e.target.value)}>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>

        <div className="fields">
          <label>
            Du
            <input
              type="date"
              min={earliest}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                if (e.target.value > endDate) setEndDate(e.target.value)
              }}
            />
          </label>
          <label>
            Au
            <input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        {/* Half days and exact hours only make sense for a single day. */}
        {oneDay && (
          <div className="choice" role="radiogroup" aria-label="Durée">
            {(
              [
                ['FULL_DAY', 'Journée'],
                ['HALF_DAY', 'Demi-journée'],
                ['CUSTOM', 'Heures précises'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={dayPart === value}
                className={dayPart === value ? 'active' : ''}
                onClick={() => setDayPart(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {oneDay && dayPart === 'CUSTOM' && (
          <div className="fields">
            <label>
              De
              <TimeField value={startTime} onChange={setStartTime} />
            </label>
            <label>
              À
              <TimeField value={endTime} onChange={setEndTime} />
            </label>
          </div>
        )}

        <label>
          Un mot pour votre responsable (facultatif)
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary wide-button" disabled={busy || !absenceTypeId || !timesValid || tooEarly}>
          Envoyer la demande
        </button>
      </form>
    </div>
  )
}
