import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { api, type Site } from '../api.ts'
import { lastSite } from './Shell.tsx'
import { useMe } from './useMe.ts'

/**
 * "/" has no screen of its own. People with a role land on the planning of
 * the last site they used; everyone else lands on their own week.
 */
export function Home() {
  const me = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (!me) return
    // A temporary password is replaced before anything else.
    if (me.mustChangePassword) {
      navigate('/moi/profil', { replace: true })
      return
    }
    if (me.grants.length === 0) {
      navigate('/moi', { replace: true })
      return
    }
    api<Site[]>('/sites').then((sites) => {
      const remembered = sites.find((site) => site.id === lastSite.get())
      const site = remembered ?? sites[0]
      navigate(site ? `/sites/${site.id}/planning` : '/moi/profil', { replace: true })
    })
  }, [me, navigate])

  return null
}
