/**
 * Mon profil: who I am, my roles, and — for an account linked to an employee —
 * my leave requests and the form to make a new one.
 */
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type LeaveRequest, type Me } from '../api.ts'
import { TIME, TimeField } from './CardEditor.tsx'
import { today } from './dates.ts'
import { periodLabel, ROUTE_LABELS, StatusBadge } from './leave.tsx'
import { Shell } from './Shell.tsx'

const ROLE_LABELS: Record<string, string> = {
  HEAD_CHEF: 'Chef de cuisine',
  MANAGER: 'Manager',
  SITE_DIRECTOR: 'Responsable de site',
  MULTI_SITE_MANAGER: 'Responsable multisite',
  HR: 'Ressources humaines',
  OPS: 'Équipe opérationnelle',
  ADMIN: 'Administrateur',
}

export function Profile() {
  const navigate = useNavigate()

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    navigate('/login')
  }

  return (
    <Shell>
      {({ me, sites }) => (
        <main className="narrow-page">
          <h1>Mon profil</h1>
          <section className="panel stack">
            <div>
              <div className="muted">E-mail</div>
              <strong>{me.email}</strong>
            </div>
            <div>
              <div className="muted">Rôles</div>
              {me.grants.length === 0 && <span>Salarié</span>}
              <ul className="plain">
                {me.grants.map((grant) => (
                  <li key={grant.role + grant.siteId}>
                    <strong>{ROLE_LABELS[grant.role] ?? grant.role}</strong>
                    {' — '}
                    {grant.siteId === null
                      ? 'tous les sites'
                      : (sites.find((site) => site.id === grant.siteId)?.name ?? '')}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <button onClick={logout}>Se déconnecter</button>
            </div>
          </section>

          {me.employeeId && <MyLeave me={me} />}
        </main>
      )}
    </Shell>
  )
}

function MyLeave({ me }: { me: Me }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [types, setTypes] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  // The form
  const [absenceTypeId, setAbsenceTypeId] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [dayPart, setDayPart] = useState<LeaveRequest['dayPart']>('FULL_DAY')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('15:00')
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    api<LeaveRequest[]>('/leave/mine').then(setRequests)
  }, [])

  useEffect(() => {
    load()
    api<{ id: string; name: string }[]>('/leave/types').then((list) => {
      setTypes(list)
      // "Congé payé" is the usual request, so it is offered first.
      setAbsenceTypeId((list.find((type) => type.name === 'Congé payé') ?? list[0])?.id ?? '')
    })
  }, [load, me.id])

  const oneDay = startDate === endDate
  const timesValid = dayPart !== 'CUSTOM' || (TIME.test(startTime) && TIME.test(endTime))

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    run(async () => {
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
      setNote('')
    })
  }

  return (
    <>
      <section className="panel">
        <h2>Nouvelle demande d'absence</h2>
        <form className="stack" onSubmit={submit}>
          <label>
            Type d'absence
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
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (e.target.value > endDate) setEndDate(e.target.value)
                }}
              />
            </label>
            <label>
              Au
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
          {oneDay && (
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
            Commentaire (facultatif)
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <div>
            <button type="submit" disabled={!absenceTypeId || !timesValid}>
              Envoyer la demande
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Mes demandes</h2>
        {requests.length === 0 && <p className="muted">Aucune demande pour l'instant.</p>}
        <ul className="plain requests">
          {requests.map((request) => (
            <li key={request.id}>
              <div className="row">
                <strong>{request.typeName}</strong>
                <StatusBadge status={request.status} />
              </div>
              <div>{periodLabel(request)}</div>
              {request.status === 'PENDING' && (
                <div className="muted">Décision par {ROUTE_LABELS[request.route]}.</div>
              )}
              {request.decisionNote && <div className="muted">« {request.decisionNote} »</div>}
              {request.status === 'PENDING' && (
                <div>
                  <button
                    className="danger"
                    onClick={() =>
                      run(() => api(`/leave/${request.id}/cancel`, { method: 'POST', body: {} }))
                    }
                  >
                    Annuler ma demande
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
