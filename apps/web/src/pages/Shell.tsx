/**
 * The frame around the management screens: logo and name, the site menu, the
 * tabs (Planning, Badgeuse, Demandes) and a link to the personal side.
 */
import { type ReactNode, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { api, type InboxRequest, type Me, type Site } from '../api.ts'
import { AccountMenu } from './AccountMenu.tsx'
import { Bell } from './Bell.tsx'
import { Logo } from './Logo.tsx'
import { useMe } from './useMe.ts'

const LAST_SITE_KEY = 'planetbao.site'

/** Remembers the site last looked at, on this browser only. */
export const lastSite = {
  get(): string | null {
    try {
      return localStorage.getItem(LAST_SITE_KEY)
    } catch {
      return null
    }
  },
  set(siteId: string) {
    try {
      localStorage.setItem(LAST_SITE_KEY, siteId)
    } catch {
      // storage unavailable: the first site is used next time
    }
  },
}

interface Props {
  /** The site being looked at; absent on "Mon profil". */
  siteId?: string
  /** Which page of a site the menu should switch to. */
  section?: 'planning' | 'badgeuse'
  children: (context: { me: Me; sites: Site[] }) => ReactNode
}

export function Shell({ siteId, section = 'planning', children }: Props) {
  const me = useMe()
  const navigate = useNavigate()
  const [sites, setSites] = useState<Site[] | null>(null)
  const [waiting, setWaiting] = useState(0)
  // The people who decide leave requests, or keep an overview of them.
  const manages =
    me?.grants.some((grant) =>
      ['HEAD_CHEF', 'SITE_DIRECTOR', 'MULTI_SITE_MANAGER', 'OPS', 'HR', 'ADMIN'].includes(grant.role),
    ) ?? false

  useEffect(() => {
    if (me) api<Site[]>('/sites').then(setSites)
  }, [me])

  // How many requests are waiting for this person, shown on the tab.
  useEffect(() => {
    if (!manages) return
    api<InboxRequest[]>('/leave/inbox')
      .then((list) =>
        setWaiting(list.filter((request) => request.canDecide).length),
      )
      .catch(() => setWaiting(0))
  }, [manages, siteId, section])

  useEffect(() => {
    if (siteId) lastSite.set(siteId)
  }, [siteId])

  if (!me || !sites) return null

  // The site shown in the menu, also when on "Mon profil".
  const current = siteId ?? lastSite.get() ?? sites[0]?.id
  const known = sites.some((site) => site.id === current) ? current : sites[0]?.id

  // The server says who may open the Badgeuse of each site.
  const seesBadgeuse = sites.find((site) => site.id === known)?.rights.seeBadgeuse ?? false

  return (
    <>
      <header className="topbar">
        <span className="brand">
          <Logo size={38} bare />
          <span>
            PLAN<span className="brand-et">et</span>BAO
          </span>
        </span>

        {sites.length > 0 && (
          <select
            className="site-menu"
            aria-label="Site"
            value={known}
            onChange={(event) => navigate(`/sites/${event.target.value}/${section}`)}
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        )}

        <nav>
          {known && <NavLink to={`/sites/${known}/planning`}>Planning</NavLink>}
          {known && seesBadgeuse && <NavLink to={`/sites/${known}/badgeuse`}>Badgeuse</NavLink>}
          {manages && (
            <NavLink to="/demandes">
              Demandes{waiting > 0 && <span className="count">{waiting}</span>}
            </NavLink>
          )}
          {/* Accounts and roles, for the administrators of the organisation. */}
          {me.grants.some((grant) => grant.role === 'ADMIN' && grant.siteId === null) && (
            <NavLink to="/comptes">Comptes</NavLink>
          )}
        </nav>

        {/* On the right: notifications, and the way to the personal side. */}
        <span className="topbar-right">
          <Bell />
          <NavLink to="/moi" className="space-switch">
            Mon espace
          </NavLink>
          <AccountMenu name={null} email={me.email} />
        </span>
      </header>
      {children({ me, sites })}
    </>
  )
}
