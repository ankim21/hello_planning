/**
 * Restaurant: the planning of one of my restaurants for the week.
 * A grid of thirty people does not fit a phone, so the week is read one day
 * at a time, as the line-up of that day: each service, then salle and cuisine.
 */
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, type MeOverview, type SiteLine, type SiteWeek } from '../api.ts'
import { addDays, capitalise, dayLabel, mondayOf, today } from '../pages/dates.ts'
import { MeShell } from './MeShell.tsx'
import { Avatar, Empty, PostChip, WeekNav } from './parts.tsx'

const SERVICES = [
  ['AM', 'Service du midi'],
  ['PM', 'Service du soir'],
] as const
const DEPARTMENTS = [
  ['SALLE', 'Salle'],
  ['KITCHEN', 'Cuisine'],
] as const

export function Restaurant() {
  return <MeShell>{(me) => (me.employee ? <Content me={me} /> : <Navigate to="/moi/profil" replace />)}</MeShell>
}

function Content({ me }: { me: MeOverview }) {
  const sites = me.employee!.sites
  const { siteId = sites[0]?.id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  // The day shown lives in the address, so a link from "Ma semaine" opens it.
  const day = params.get('jour') ?? today()
  const monday = mondayOf(day)
  const [week, setWeek] = useState<SiteWeek | null>(null)

  useEffect(() => {
    if (!siteId) return
    setWeek(null)
    api<SiteWeek>(`/me/sites/${siteId}/week?from=${monday}`).then(setWeek)
  }, [siteId, monday])

  if (!siteId) return <Empty title="Aucun restaurant">Vous n'êtes affecté à aucun site.</Empty>

  const setDay = (date: string) => setParams({ jour: date }, { replace: true })
  const lines = week?.days.find((entry) => entry.date === day)?.lines ?? []

  return (
    <div className="me-single">
      {sites.length > 1 ? (
        <div className="site-switch" role="tablist" aria-label="Mes restaurants">
          {sites.map((site) => (
            <button
              key={site.id}
              role="tab"
              aria-selected={site.id === siteId}
              className={site.id === siteId ? 'active' : ''}
              onClick={() => navigate(`/moi/restaurant/${site.id}?jour=${day}`, { replace: true })}
            >
              {site.name}
              {site.isPrimary && <span className="star" title="Restaurant principal">★</span>}
            </button>
          ))}
        </div>
      ) : (
        <h1 className="me-title">{sites[0].name}</h1>
      )}

      <WeekNav monday={monday} onChange={(next) => setDay(next)} />

      <div className="day-pills">
        {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((date) => {
          const mine = week?.days.find((entry) => entry.date === date)?.lines.some((line) => line.isMe)
          return (
            <button
              key={date}
              className={[date === day ? 'active' : '', date === today() ? 'today' : ''].join(' ')}
              aria-pressed={date === day}
              onClick={() => setDay(date)}
            >
              <span>{dayLabel(date, { weekday: 'short' }).replace('.', '')}</span>
              <strong>{Number(date.slice(8))}</strong>
              {/* A dot marks the days I work there. */}
              <i className={mine ? 'dot mine' : 'dot'} />
            </button>
          )
        })}
      </div>

      <h2 className="lineup-title">
        {capitalise(dayLabel(day, { weekday: 'long', day: 'numeric', month: 'long' }))}
        {week && (
          <span className="muted">
            {' · '}
            {new Set(lines.map((line) => line.employee.id)).size} personne
            {new Set(lines.map((line) => line.employee.id)).size > 1 ? 's' : ''}
          </span>
        )}
      </h2>

      {week?.published === 'NONE' && (
        <Empty title="Planning pas encore publié">
          Il apparaîtra ici dès que le responsable l'aura publié.
        </Empty>
      )}
      {week?.published === 'PARTIAL' && (
        <p className="unpublished-note">
          Ce planning n'est publié qu'en partie : la salle ou la cuisine reste à venir.
        </p>
      )}
      {week && week.published !== 'NONE' && lines.length === 0 && (
        <Empty title="Personne de planifié ce jour-là" />
      )}

      {SERVICES.map(([service, label]) => {
        const ofService = lines.filter((line) => line.service === service)
        if (ofService.length === 0) return null
        return (
          <section key={service} className="lineup">
            <header>
              <strong>{label}</strong>
              <span className="muted">
                {ofService.length} personne{ofService.length > 1 ? 's' : ''}
              </span>
            </header>
            {DEPARTMENTS.map(([department, name]) => {
              const group = ofService.filter((line) => line.department === department)
              if (group.length === 0) return null
              return (
                <div key={department} className="lineup-group">
                  <span className="eyebrow">{name}</span>
                  <ul>
                    {group.map((line) => (
                      <Line key={line.id} line={line} />
                    ))}
                  </ul>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

function Line({ line }: { line: SiteLine }) {
  return (
    <li className={line.isMe ? 'line me-line' : 'line'}>
      <Avatar person={line.employee} size={36} />
      <span className="line-who">
        <strong>
          {line.employee.firstName} {line.employee.lastName}
          {line.isMe && <span className="you">Vous</span>}
        </strong>
        <PostChip name={line.postName} color={line.color} />
      </span>
      <span className="line-time">
        {line.start}
        <span className="muted"> – {line.end}</span>
      </span>
    </li>
  )
}
