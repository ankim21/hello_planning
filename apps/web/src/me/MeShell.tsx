/**
 * The frame of "Mon espace", the personal side of PLANetBAO.
 *
 * Four destinations: Ma semaine, Restaurant, Congés, Profil. On a phone they
 * sit in a bar at the bottom, under the thumb; on a computer they move into
 * the header. People who also manage a site get a link to the management
 * screens ("Gestion").
 */
import { type ReactNode, useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { api, ApiError, type MeOverview } from '../api.ts'
import { Logo } from '../pages/Logo.tsx'
import './me.css'
import { Avatar, LeaveIcon, ProfileIcon, TeamIcon, WeekIcon } from './parts.tsx'

export function MeShell({ children }: { children: (me: MeOverview) => ReactNode }) {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeOverview | null>(null)

  useEffect(() => {
    api<MeOverview>('/me')
      .then(setMe)
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) navigate('/login')
      })
  }, [navigate])

  if (!me) return null
  const employee = me.employee

  return (
    <div className="me">
      <header className="me-top">
        <Link to="/moi" className="brand">
          <Logo size={34} bare />
          <span>
            PLAN<span className="brand-et">et</span>BAO
          </span>
        </Link>

        <nav className="me-nav" aria-label="Mon espace">
          {/* An account with no employee behind it (office, administrator)
              has no week of its own: only the profile. */}
          {employee && (
            <>
              <NavLink to="/moi" end>
                <WeekIcon />
                <span>Ma semaine</span>
              </NavLink>
              <NavLink to="/moi/restaurant">
                <TeamIcon />
                <span>Restaurant</span>
              </NavLink>
              <NavLink to="/moi/conges">
                <LeaveIcon />
                <span>Congés</span>
              </NavLink>
            </>
          )}
          <NavLink to="/moi/profil">
            <ProfileIcon />
            <span>Profil</span>
          </NavLink>
        </nav>

        <span className="me-top-right">
          {me.hasManagement && (
            <Link to="/" className="space-switch">
              Gestion
            </Link>
          )}
          {employee && (
            <Link to="/moi/profil" aria-label="Mon profil">
              <Avatar person={employee} size={34} />
            </Link>
          )}
        </span>
      </header>

      <main className="me-main">{children(me)}</main>
    </div>
  )
}
