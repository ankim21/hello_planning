/**
 * Demandes: the leave requests this person decides or follows. The site
 * director decides salle requests, the head chef kitchen ones; the site
 * director and the multi-site manager see all of them, as an overview.
 *
 * Also here: the requests to archive an employee. A site director asks (from
 * the planning, which hides the person at once), HR approves or refuses.
 */
import { useCallback, useEffect, useState } from 'react'
import { api, type ArchiveRequest, type InboxRequest } from '../api.ts'
import { dayLabel } from './dates.ts'
import { periodLabel, ROUTE_LABELS, StatusBadge } from './leave.tsx'
import { Shell } from './Shell.tsx'

export function Requests() {
  return <Shell>{() => <Inbox />}</Shell>
}

function Inbox() {
  const [requests, setRequests] = useState<InboxRequest[] | null>(null)
  const [archives, setArchives] = useState<ArchiveRequest[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<InboxRequest[]>('/leave/inbox?status=ALL')
      .then(setRequests)
      .catch((caught) => setError((caught as Error).message))
    api<ArchiveRequest[]>('/archive-requests')
      .then(setArchives)
      .catch(() => setArchives([]))
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

  const ARCHIVE_LABELS = {
    PENDING: 'En attente',
    APPROVED: 'Archivé',
    REFUSED: 'Refusée',
    CANCELLED: 'Annulée',
  } as const
  const short = (at: string) =>
    dayLabel(at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })

  function refuseArchive(request: ArchiveRequest) {
    const note = window.prompt(
      `Motif du refus pour l'archivage de ${request.employee.firstName} ${request.employee.lastName} (facultatif) :`,
    )
    if (note === null) return
    act(`/archive-requests/${request.id}/decision`, { approve: false, note })
  }

  const archiveCard = (request: ArchiveRequest) => (
    <li key={request.id} className="panel request">
      <div className="row">
        <strong>
          {request.employee.firstName} {request.employee.lastName}
          <span className="muted"> · {request.site.name}</span>
        </strong>
        <span className={`state leave-${request.status}`}>{ARCHIVE_LABELS[request.status]}</span>
      </div>
      <div>
        Archivage demandé par <strong>{request.requestedBy}</strong> le {short(request.requestedAt)}
      </div>
      {request.reason && <div className="muted">« {request.reason} »</div>}
      {request.status === 'PENDING' && (
        <div className="muted">
          Déjà retiré du planning de {request.site.name}. Décision par les ressources humaines.
        </div>
      )}
      {request.decidedBy && request.decidedAt && (
        <div className="muted">
          {ARCHIVE_LABELS[request.status]} par {request.decidedBy} le {short(request.decidedAt)}
          {request.decisionNote && <> : « {request.decisionNote} »</>}
        </div>
      )}
      {(request.canDecide || request.canCancel) && (
        <div className="request-actions">
          {request.canDecide && (
            <>
              <button
                className="primary"
                onClick={() => act(`/archive-requests/${request.id}/decision`, { approve: true })}
              >
                Archiver
              </button>
              <button className="danger" onClick={() => refuseArchive(request)}>
                Refuser
              </button>
            </>
          )}
          {request.canCancel && (
            <button onClick={() => act(`/archive-requests/${request.id}/cancel`)}>
              Annuler la demande
            </button>
          )}
        </div>
      )}
    </li>
  )
  const archivesPending = archives.filter((request) => request.status === 'PENDING')
  const archivesDecided = archives.filter((request) => request.status !== 'PENDING')

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

      {archives.length > 0 && (
        <>
          <h1>Demandes d'archivage</h1>
          <h2 className="section">En attente ({archivesPending.length})</h2>
          {archivesPending.length === 0 && <p className="muted">Aucune demande en attente.</p>}
          <ul className="plain">{archivesPending.map(archiveCard)}</ul>
          {archivesDecided.length > 0 && (
            <>
              <h2 className="section">Traitées</h2>
              <ul className="plain">{archivesDecided.map(archiveCard)}</ul>
            </>
          )}
        </>
      )}
    </main>
  )
}
