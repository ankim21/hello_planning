/**
 * Demandes: the leave requests this person decides. Only the people who
 * decide (site directors, and HR or the multi-site manager for their own
 * cases) have this tab.
 */
import { useCallback, useEffect, useState } from 'react'
import { api, type InboxRequest } from '../api.ts'
import { periodLabel, ROUTE_LABELS, StatusBadge } from './leave.tsx'
import { Shell } from './Shell.tsx'

export function Requests() {
  return <Shell>{() => <Inbox />}</Shell>
}

function Inbox() {
  const [requests, setRequests] = useState<InboxRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<InboxRequest[]>('/leave/inbox?status=ALL')
      .then(setRequests)
      .catch((caught) => setError((caught as Error).message))
  }, [])
  useEffect(load, [load])

  async function act(path: string, body: unknown = {}) {
    setError(null)
    try {
      await api(path, { method: 'POST', body })
      load()
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  function refuse(request: InboxRequest) {
    const note = window.prompt(
      `Motif du refus pour ${request.employee.firstName} ${request.employee.lastName} (facultatif) :`,
    )
    if (note === null) return // window closed: nothing happens
    act(`/leave/${request.id}/decision`, { approve: false, note })
  }

  if (!requests) return <main>{error && <p className="error">{error}</p>}</main>

  const pending = requests.filter((request) => request.status === 'PENDING')
  const decided = requests.filter((request) => request.status !== 'PENDING')

  const card = (request: InboxRequest) => (
    <li key={request.id} className="panel request">
      <div className="row">
        <strong>
          {request.employee.firstName} {request.employee.lastName}
          <span className="muted"> · {request.site.name}</span>
        </strong>
        <StatusBadge status={request.status} />
      </div>
      <div>
        <strong>{request.typeName}</strong> {periodLabel(request)}
      </div>
      {request.note && <div className="muted">« {request.note} »</div>}
      {request.status === 'PENDING' && (
        <div className="muted">Décision par {ROUTE_LABELS[request.route]}.</div>
      )}
      {request.plannedShifts > 0 && (
        <div className="flag">
          {request.plannedShifts} shift{request.plannedShifts > 1 ? 's' : ''} déjà planifié
          {request.plannedShifts > 1 ? 's' : ''} sur cette période
        </div>
      )}
      {request.decisionNote && <div className="muted">Motif : « {request.decisionNote} »</div>}
      {request.canDecide && (
        <div className="request-actions">
          <button
            className="primary"
            onClick={() => act(`/leave/${request.id}/decision`, { approve: true })}
          >
            Approuver
          </button>
          <button className="danger" onClick={() => refuse(request)}>
            Refuser
          </button>
        </div>
      )}
    </li>
  )

  return (
    <main className="narrow-page">
      <h1>Demandes d'absence</h1>
      {error && <p className="error">{error}</p>}
      <h2 className="section">En attente ({pending.length})</h2>
      {pending.length === 0 && <p className="muted">Aucune demande en attente.</p>}
      <ul className="plain">{pending.map(card)}</ul>
      {decided.length > 0 && (
        <>
          <h2 className="section">Traitées</h2>
          <ul className="plain">{decided.map(card)}</ul>
        </>
      )}
    </main>
  )
}
