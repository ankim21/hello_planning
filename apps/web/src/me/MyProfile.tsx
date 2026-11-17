/**
 * Profil: who I am, then one card per restaurant I work at — the main one
 * first — with what is coming up there.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, type MeOverview, type MyWeek } from '../api.ts'
import { dayLabel, hours, mondayOf, today } from '../pages/dates.ts'
import { MeShell } from './MeShell.tsx'
import { Avatar, PinIcon, PostChip } from './parts.tsx'

/**
 * My phone number. Colleagues are given it only when I run a service
 * (manager of the service, or site director), to call me if they cannot come.
 */
function PhoneField({ initial }: { initial: string | null }) {
  const [phone, setPhone] = useState(initial ?? '')
  const [saved, setSaved] = useState(initial ?? '')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    try {
      await api('/me/phone', { method: 'PUT', body: { phone: phone.trim() || null } })
      setSaved(phone.trim())
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  return (
    <section>
      <h2 className="eyebrow">Mon téléphone</h2>
      <div className="phone-field">
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+33 6 12 34 56 78"
          aria-label="Mon numéro de téléphone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <button className="primary" disabled={phone.trim() === saved} onClick={save}>
          Enregistrer
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted phone-note">
        Il n'est montré à vos collègues que lorsque vous êtes responsable d'un service, pour
        qu'ils puissent vous appeler en cas d'empêchement.
      </p>
    </section>
  )
}

const ROLE_LABELS: Record<string, string> = {
  HEAD_CHEF: 'Chef de cuisine',
  MANAGER: 'Manager',
  SITE_DIRECTOR: 'Responsable de site',
  MULTI_SITE_MANAGER: 'Responsable multisite',
  HR: 'Ressources humaines',
  OPS: 'Équipe opérationnelle',
  ADMIN: 'Administrateur',
}

export function MyProfile() {
  return <MeShell>{(me) => <Content me={me} />}</MeShell>
}

function Content({ me }: { me: MeOverview }) {
  const navigate = useNavigate()
  const employee = me.employee
  const [week, setWeek] = useState<MyWeek | null>(null)

  useEffect(() => {
    if (employee) api<MyWeek>(`/me/week?from=${mondayOf(today())}`).then(setWeek)
  }, [employee])

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    navigate('/login')
  }

  const roles = [...new Set(me.grants.map((grant) => ROLE_LABELS[grant.role] ?? grant.role))]

  return (
    <div className="me-single">
      <section className="identity">
        {employee && <Avatar person={employee} size={72} />}
        <div>
          <h1 className="me-title">
            {employee ? `${employee.firstName} ${employee.lastName}` : 'Mon compte'}
          </h1>
          <span className="muted">{me.email}</span>
          <div className="identity-tags">
            {employee && (
              <span className="tag">
                {employee.forfaitJours
                  ? 'Forfait jours'
                  : employee.contractMinutes !== null
                    ? `${hours(employee.contractMinutes)} par semaine`
                    : 'Contrat non renseigné'}
              </span>
            )}
            {roles.map((role) => (
              <span key={role} className="tag role">
                {role}
              </span>
            ))}
          </div>
        </div>
      </section>

      {employee && <PhoneField initial={employee.phone} />}

      {employee && (
        <>
          <section>
            <h2 className="eyebrow">
              {employee.sites.length > 1 ? 'Mes restaurants' : 'Mon restaurant'}
            </h2>
            <ul className="site-cards">
              {employee.sites.map((site) => {
                const mine = week?.bySite.find((entry) => entry.site.id === site.id)
                return (
                  <li key={site.id} className="site-card">
                    <div className="site-card-head">
                      <strong>
                        <PinIcon /> {site.name}
                      </strong>
                      {site.isPrimary && employee.sites.length > 1 && (
                        <span className="tag primary">Principal</span>
                      )}
                    </div>
                    <dl>
                      <div>
                        <dt>Cette semaine</dt>
                        <dd>
                          {mine
                            ? `${mine.shifts} shift${mine.shifts > 1 ? 's' : ''} · ${hours(mine.minutes)}`
                            : 'Aucun shift'}
                        </dd>
                      </div>
                      <div>
                        <dt>Prochain shift</dt>
                        <dd>
                          {site.nextShift
                            ? `${dayLabel(site.nextShift.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${site.nextShift.start} – ${site.nextShift.end} · ${site.nextShift.postName}`
                            : 'Rien de prévu'}
                        </dd>
                      </div>
                    </dl>
                    <Link to={`/moi/restaurant/${site.id}`} className="card-link">
                      Voir le planning du restaurant →
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          {employee.posts.length > 0 && (
            <section>
              <h2 className="eyebrow">Mes postes</h2>
              <div className="chips">
                {employee.posts.map((post) => (
                  <PostChip key={post.id} name={post.name} color={post.color} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="profile-actions">
        {me.hasManagement && (
          <Link to="/" className="button-link">
            Ouvrir l'espace de gestion
          </Link>
        )}
        <button onClick={logout}>Se déconnecter</button>
      </section>
    </div>
  )
}
