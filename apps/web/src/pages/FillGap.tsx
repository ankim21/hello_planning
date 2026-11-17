/**
 * Filling a missing post in one click.
 *
 * Opened from a line of the "postes manquants" list. The server proposes the
 * people who could take the post, best choice first: free on that service,
 * holding the post, without a new alert, with the most hours left on their
 * contract. The planner picks one; a normal shift is then added, with the
 * restaurant's usual hours for that post.
 */
import { type CSSProperties, useCallback, useEffect, useState } from 'react'
import { api, type MissingPost, type Person, type PlanningAlert } from '../api.ts'
import { alertText } from './alertText.ts'
import { capitalise, dayLabel, decimalHours, hours } from './dates.ts'

interface Suggestions {
  post: { id: string; name: string; color: string }
  template: {
    start: string
    end: string
    breakMinutes: number
    meals: number
    /** The hours come from this post's history, the service's, or a default. */
    source: 'post' | 'service' | 'default'
  }
  minutes: number
  candidates: {
    employee: Person
    contractMinutes: number | null
    plannedMinutes: number
    remainingMinutes: number | null
    newAlerts: PlanningAlert[]
  }[]
}

export function FillGap({
  siteId,
  gap,
  onClose,
  onFilled,
}: {
  siteId: string
  gap: MissingPost
  onClose: () => void
  /** Called after each person is planned, so the planning behind refreshes. */
  onFilled: () => void
}) {
  const [data, setData] = useState<Suggestions | null>(null)
  const [stillMissing, setStillMissing] = useState(gap.needed - gap.planned)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<Suggestions>(
      `/sites/${siteId}/suggestions?date=${gap.date}&service=${gap.service}&postId=${gap.postId}`,
    )
      .then(setData)
      .catch((caught) => setError((caught as Error).message))
  }, [siteId, gap])
  useEffect(load, [load])

  // Escape closes the window, as clicking outside it does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function plan(employee: Person) {
    if (!data) return
    setBusy(true)
    setError(null)
    try {
      await api(`/sites/${siteId}/shifts`, {
        method: 'POST',
        body: {
          employeeId: employee.id,
          postId: data.post.id,
          service: gap.service,
          date: gap.date,
          start: data.template.start,
          end: data.template.end,
          breakMinutes: data.template.breakMinutes,
          meals: data.template.meals,
        },
      })
      onFilled()
      // Filled: close. Still short: stay open with the list brought up to date.
      if (stillMissing <= 1) onClose()
      else {
        setStillMissing(stillMissing - 1)
        load()
      }
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Combler le poste ${gap.label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className="dialog-head shift"
          style={{ '--post': data?.post.color ?? '#6b7280' } as CSSProperties}
        >
          <div className="row">
            <strong className="dialog-title">Combler : {gap.label}</strong>
            <button onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
          <div className="dialog-date">
            {capitalise(dayLabel(gap.date, { weekday: 'long', day: 'numeric', month: 'long' }))} ·{' '}
            {gap.service === 'AM' ? 'midi' : 'soir'} · il manque {stillMissing} personne
            {stillMissing > 1 ? 's' : ''}
          </div>
        </header>

        <div className="stack dialog-body">
          {data && (
            <p className="fill-hours">
              Shift proposé :{' '}
              <strong>
                {data.template.start} – {data.template.end}
              </strong>{' '}
              ({decimalHours(data.minutes)}
              {data.template.breakMinutes > 0 ? `, pause ${data.template.breakMinutes} min` : ', sans pause'}
              )
              <span className="muted">
                {
                  {
                    post: ' — les horaires les plus fréquents pour ce poste',
                    service:
                      ' — les horaires les plus fréquents de ce service (ce poste n’a pas encore d’historique), à ajuster ensuite si besoin',
                    default: ' — horaires par défaut, à ajuster ensuite si besoin',
                  }[data.template.source]
                }
              </span>
            </p>
          )}

          {data && data.candidates.length === 0 && (
            <p className="muted">
              Personne de disponible : tous ceux qui tiennent ce poste sont déjà planifiés sur ce
              service, ou absents ce jour-là.
            </p>
          )}

          <ul className="plain candidates">
            {data?.candidates.map((candidate, index) => (
              <li key={candidate.employee.id}>
                <span className="candidate-who">
                  <strong>
                    {candidate.employee.firstName} {candidate.employee.lastName}
                    {index === 0 && candidate.newAlerts.length === 0 && (
                      <span className="state ok">Meilleur choix</span>
                    )}
                  </strong>
                  <span className="muted">
                    {candidate.contractMinutes === null
                      ? 'Forfait jours'
                      : candidate.remainingMinutes! > 0
                        ? `Reste ${hours(candidate.remainingMinutes!)} à planifier sur ${hours(candidate.contractMinutes)}`
                        : `Contrat déjà atteint (${hours(candidate.plannedMinutes)} sur ${hours(candidate.contractMinutes)})`}
                  </span>
                  {candidate.newAlerts.map((alert, i) => (
                    <span key={i} className="flag">
                      ⚠ {alertText(alert)}
                    </span>
                  ))}
                </span>
                <button className="primary" disabled={busy} onClick={() => plan(candidate.employee)}>
                  Planifier
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
