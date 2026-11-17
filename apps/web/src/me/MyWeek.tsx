/**
 * Ma semaine: everything I do this week, in every restaurant I work at.
 * The next shift comes first, because that is the question people open the
 * app with; then the week, day by day.
 */
import { type CSSProperties, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { api, type MeOverview, type MyDay, type MyShift, type MyWeek as Week } from '../api.ts'
import { capitalise, dayLabel, hours, mondayOf, today } from '../pages/dates.ts'
import { MeShell } from './MeShell.tsx'
import { Avatar, AvatarStack, Empty, namesOf, PinIcon, PostChip, relativeDay, WeekNav } from './parts.tsx'

export function MyWeek() {
  return <MeShell>{(me) => (me.employee ? <Content me={me} /> : <Navigate to="/moi/profil" replace />)}</MeShell>
}

function Content({ me }: { me: MeOverview }) {
  // A notification can open a given week: /moi?semaine=2026-11-23
  const [params] = useSearchParams()
  const asked = params.get('semaine')
  const [monday, setMonday] = useState(() => mondayOf(asked ?? today()))
  useEffect(() => {
    if (asked) setMonday(mondayOf(asked))
  }, [asked])
  const [week, setWeek] = useState<Week | null>(null)
  const [open, setOpen] = useState<string | null>(null) // the shift whose team is unfolded
  const [problem, setProblem] = useState<MyShift | null>(null) // "I cannot come"

  useEffect(() => {
    api<Week>(`/me/week?from=${monday}`).then(setWeek)
  }, [monday])

  const employee = me.employee!
  const severalSites = employee.sites.length > 1

  return (
    <div className="me-columns">
      <section className="me-side">
        <p className="hello">Bonjour {employee.firstName}</p>
        <NextShift shift={week?.nextShift ?? null} loaded={week !== null} onProblem={setProblem} />
      </section>

      <section>
        <WeekNav monday={monday} onChange={setMonday} />
        {week && week.sites.every((site) => site.published === 'NONE') && (
          <Empty title="Planning pas encore publié">
            Vous le verrez ici dès que votre responsable l'aura publié.
          </Empty>
        )}
        {week && week.sites.some((site) => site.published !== 'NONE') && (
          <>
            <Summary week={week} />
            {/* Some of my restaurants have published, others not yet. */}
            {week.sites
              .filter((site) => site.published !== 'ALL')
              .map((site) => (
                <p key={site.id} className="unpublished-note">
                  {site.published === 'NONE'
                    ? `Le planning de ${site.name} n'est pas encore publié pour cette semaine.`
                    : `Le planning de ${site.name} n'est publié qu'en partie pour cette semaine.`}
                </p>
              ))}
            <ol className="days">
              {week.days.map((day) => (
                <Day
                  key={day.date}
                  day={day}
                  showSite={severalSites}
                  open={open}
                  onToggle={(id) => setOpen(open === id ? null : id)}
                  onProblem={setProblem}
                />
              ))}
            </ol>
          </>
        )}
      </section>

      {problem && <CallSheet shift={problem} onClose={() => setProblem(null)} />}
    </div>
  )
}

/**
 * "I cannot come." A shift is not cancelled from the app: the employee phones
 * the person running the service, whose number is given here.
 */
function CallSheet({ shift, onClose }: { shift: MyShift; onClose: () => void }) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Un empêchement"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <strong>Un empêchement ?</strong>
          <button type="button" className="round" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <p className="call-shift">
          {capitalise(relativeDay(shift.date))} · {shift.start} – {shift.end} · {shift.site.name}
        </p>
        <p className="call-rule">
          Un shift ne s'annule pas depuis l'application. <strong>Appelez directement</strong> le
          responsable de ce service, le plus tôt possible.
        </p>
        {shift.whoToCall.length === 0 && (
          <p className="unpublished-note">
            Aucun responsable n'est renseigné pour ce service. Contactez votre restaurant.
          </p>
        )}
        <ul className="call-list">
          {shift.whoToCall.map((contact) => (
            <li key={contact.id}>
              <Avatar person={contact} size={44} />
              <span className="call-who">
                <strong>
                  {contact.firstName} {contact.lastName}
                </strong>
                <span className="muted">{contact.role}</span>
              </span>
              {contact.phone ? (
                <a className="call-button" href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}>
                  Appeler
                  <span>{contact.phone}</span>
                </a>
              ) : (
                <span className="muted">Numéro non renseigné</span>
              )}
            </li>
          ))}
        </ul>
        <p className="muted call-foot">
          Pour des congés à partir de la semaine prochaine, utilisez l'onglet Congés.
        </p>
      </div>
    </div>
  )
}

/** The dark card at the top: when, where, as what, and with whom. */
function NextShift({
  shift,
  loaded,
  onProblem,
}: {
  shift: MyShift | null
  loaded: boolean
  onProblem: (shift: MyShift) => void
}) {
  if (!loaded) return <div className="next-card placeholder" />
  if (!shift) {
    return (
      <div className="next-card">
        <span className="eyebrow">Prochain shift</span>
        <strong className="next-when">Rien de prévu</strong>
        <span className="next-where">Aucun shift à venir pour l'instant.</span>
      </div>
    )
  }
  return (
    <div className="next-card">
      <span className="eyebrow">Prochain shift</span>
      <strong className="next-when">{capitalise(relativeDay(shift.date))}</strong>
      <span className="next-time">
        {shift.start} – {shift.end}
      </span>
      <Link to={`/moi/restaurant/${shift.site.id}?jour=${shift.date}`} className="next-where">
        <PinIcon /> {shift.site.name}
      </Link>
      <div className="next-foot">
        <PostChip name={shift.postName} color={shift.color} service={shift.service} />
        {shift.coworkers.length > 0 && (
          <span className="with">
            <AvatarStack people={shift.coworkers} />
            <span>Avec {namesOf(shift.coworkers)}</span>
          </span>
        )}
        {shift.whoToCall.length > 0 && (
          <button className="problem on-dark" onClick={() => onProblem(shift)}>
            Un empêchement ?
          </button>
        )}
      </div>
    </div>
  )
}

/** Hours planned against the contract, and the split between restaurants. */
function Summary({ week }: { week: Week }) {
  const { contractMinutes, absenceMinutes } = week
  // Paid leave counts with the shifts against the contract.
  const totalMinutes = week.totalMinutes + absenceMinutes
  const ratio = contractMinutes ? Math.min(1, totalMinutes / contractMinutes) : 0
  const shifts = week.days.reduce((count, day) => count + day.shifts.length, 0)
  return (
    <div className="summary">
      <div className="summary-line">
        <span>
          <strong>{hours(totalMinutes)}</strong> planifiées
          {contractMinutes !== null && <span className="muted"> sur {hours(contractMinutes)}</span>}
          {absenceMinutes > 0 && (
            <span className="muted"> · dont {hours(absenceMinutes)} de congé payé</span>
          )}
        </span>
        <span className="muted">
          {shifts} shift{shifts > 1 ? 's' : ''}
        </span>
      </div>
      {contractMinutes !== null && (
        <div className="progress" role="img" aria-label={`${Math.round(ratio * 100)} % du contrat`}>
          <span style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
      {week.bySite.length > 1 && (
        <div className="summary-sites">
          {week.bySite.map(({ site, shifts: count, minutes }) => (
            <Link key={site.id} to={`/moi/restaurant/${site.id}`} className="site-tag">
              <PinIcon /> {site.name} · {hours(minutes)} · {count} shift{count > 1 ? 's' : ''}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Day({
  day,
  showSite,
  open,
  onToggle,
  onProblem,
}: {
  day: MyDay
  showSite: boolean
  open: string | null
  onToggle: (shiftId: string) => void
  onProblem: (shift: MyShift) => void
}) {
  const isToday = day.date === today()
  const empty = day.shifts.length + day.absences.length + day.requests.length === 0
  return (
    <li className={['day', isToday ? 'today' : '', day.date < today() ? 'past' : ''].join(' ')}>
      <div className="day-date">
        <span>{dayLabel(day.date, { weekday: 'short' }).replace('.', '')}</span>
        <strong>{Number(day.date.slice(8))}</strong>
      </div>
      <div className="day-items">
        {empty && <span className="rest">Repos</span>}

        {day.absences.map((absence) => (
          <div key={absence.id} className="item absence-item">
            <strong>{absence.typeName}</strong>
            <span>
              {absence.dayPart === 'CUSTOM'
                ? `${absence.startTime} – ${absence.endTime}`
                : absence.dayPart === 'HALF_DAY'
                  ? 'Demi-journée'
                  : 'Toute la journée'}
              {absence.dayMinutes !== null && ` · ${hours(absence.dayMinutes)}`}
            </span>
          </div>
        ))}

        {day.requests.map((request) => (
          <Link key={request.id} to="/moi/conges" className="item request-item">
            <strong>{request.typeName}</strong>
            <span>Demande en attente</span>
          </Link>
        ))}

        {day.shifts.map((shift) => {
          const unfolded = open === shift.id
          return (
            <article key={shift.id} className="item shift-item" style={{ '--post': shift.color } as CSSProperties}>
              <div className="shift-head">
                <strong>
                  {shift.start} – {shift.end}
                </strong>
                <span className="muted">{hours(shift.minutes)}</span>
              </div>
              <PostChip name={shift.postName} color={shift.color} service={shift.service} />
              {/* The restaurant is only worth a line for people who work in several. */}
              {showSite && (
                <Link to={`/moi/restaurant/${shift.site.id}?jour=${shift.date}`} className="shift-site">
                  <PinIcon /> {shift.site.name}
                </Link>
              )}
              {shift.coworkers.length > 0 ? (
                <button className="team-toggle" aria-expanded={unfolded} onClick={() => onToggle(shift.id)}>
                  <AvatarStack people={shift.coworkers} />
                  <span>Avec {namesOf(shift.coworkers)}</span>
                  <span className="chevron">{unfolded ? '▴' : '▾'}</span>
                </button>
              ) : (
                <span className="team-none">Personne d'autre de planifié sur ce créneau</span>
              )}
              {unfolded && (
                <ul className="team">
                  {shift.coworkers.map((coworker) => (
                    <li key={coworker.id}>
                      <Avatar person={coworker} size={28} />
                      <span>
                        {coworker.firstName} {coworker.lastName}
                      </span>
                      <PostChip name={coworker.postName} color={coworker.color} />
                    </li>
                  ))}
                  {!showSite && (
                    <li>
                      <Link to={`/moi/restaurant/${shift.site.id}?jour=${shift.date}`}>
                        Voir toute l'équipe du jour →
                      </Link>
                    </li>
                  )}
                </ul>
              )}
              {/* Only on shifts of the week in progress that are still to come. */}
              {shift.whoToCall.length > 0 && (
                <button className="problem" onClick={() => onProblem(shift)}>
                  Un empêchement ?
                </button>
              )}
            </article>
          )
        })}
      </div>
    </li>
  )
}
