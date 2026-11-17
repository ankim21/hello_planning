/**
 * Besoins: the restaurant's general rule for a week. For each day and each
 * service (midi, soir), how many people are needed on each post, and how
 * many in total in the salle and in the kitchen.
 *
 * The same rule applies every week. The planning then warns, day by day,
 * about the posts that are missing.
 */
import { useEffect, useState } from 'react'
import { api, type Department, type PlanningWeek } from '../api.ts'

const DAYS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.']
const SERVICES = ['AM', 'PM'] as const

interface Need {
  weekday: number
  service: 'AM' | 'PM'
  postId: string | null
  department: Department | null
  count: number
}

/** A line of the grid: one post, or the total of a department. */
type Line = { key: string; label: string; postId: string | null; department: Department | null }

const cellKey = (line: Line, weekday: number, service: string) => `${line.key}|${weekday}|${service}`

export function NeedsDialog({
  siteId,
  siteName,
  posts,
  onClose,
  onSaved,
}: {
  siteId: string
  siteName: string
  posts: PlanningWeek['posts']
  onClose: () => void
  onSaved: () => void
}) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The total of a department first, then its posts.
  const lines: Line[] = (['SALLE', 'KITCHEN'] as const).flatMap((department) => [
    {
      key: `D:${department}`,
      label: department === 'SALLE' ? 'Salle — total' : 'Cuisine — total',
      postId: null,
      department,
    },
    ...posts
      .filter((post) => post.department === department)
      .map((post) => ({ key: post.id, label: post.name, postId: post.id, department: null })),
  ])

  useEffect(() => {
    api<Need[]>(`/sites/${siteId}/needs`).then((needs) => {
      const loaded: Record<string, number> = {}
      for (const need of needs) {
        const key = need.postId ?? `D:${need.department}`
        loaded[`${key}|${need.weekday}|${need.service}`] = need.count
      }
      setCounts(loaded)
    })
  }, [siteId])

  async function save() {
    if (!counts) return
    setBusy(true)
    setError(null)
    const needs: Need[] = lines.flatMap((line) =>
      DAYS.flatMap((_, weekday) =>
        SERVICES.map((service) => ({
          weekday,
          service,
          postId: line.postId,
          department: line.department,
          count: counts[cellKey(line, weekday, service)] ?? 0,
        })),
      ),
    ).filter((need) => need.count > 0)
    try {
      await api(`/sites/${siteId}/needs`, { method: 'PUT', body: { needs } })
      onSaved()
    } catch (caught) {
      setError((caught as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog needs-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Besoins du restaurant"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-head absence">
          <div className="row">
            <strong className="dialog-title">Besoins de {siteName}</strong>
            <button onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
          <div className="dialog-date">
            Nombre de personnes voulu par poste, pour chaque jour et chaque service. La règle vaut
            pour toutes les semaines ; le planning signale les postes manquants.
          </div>
        </header>

        <div className="dialog-body needs-scroll">
          {counts && (
            <table className="needs">
              <thead>
                <tr>
                  <th rowSpan={2}>Poste</th>
                  {DAYS.map((day) => (
                    <th key={day} colSpan={2}>
                      {day}
                    </th>
                  ))}
                </tr>
                <tr>
                  {DAYS.flatMap((day) =>
                    SERVICES.map((service) => (
                      <th key={day + service} className="service">
                        {service === 'AM' ? 'midi' : 'soir'}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className={line.postId ? '' : 'total-line'}>
                    <th>{line.label}</th>
                    {DAYS.flatMap((day, weekday) =>
                      SERVICES.map((service) => {
                        const key = cellKey(line, weekday, service)
                        return (
                          <td key={key}>
                            <input
                              type="number"
                              min={0}
                              max={50}
                              aria-label={`${line.label}, ${day} ${service === 'AM' ? 'midi' : 'soir'}`}
                              value={counts[key] || ''}
                              placeholder="–"
                              onChange={(event) =>
                                setCounts({ ...counts, [key]: Math.max(0, Number(event.target.value)) })
                              }
                            />
                          </td>
                        )
                      }),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        <footer className="row dialog-body">
          <span className="muted">Une case vide = pas de besoin.</span>
          <span>
            <button onClick={onClose}>Annuler</button>{' '}
            <button className="primary" disabled={busy || !counts} onClick={save}>
              Enregistrer
            </button>
          </span>
        </footer>
      </div>
    </div>
  )
}
