import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { api, type Site } from '../api.ts'
import { lastSite } from './Shell.tsx'
import { useMe } from './useMe.ts'

/** "/" has no screen of its own: it opens the planning of the last site used. */
export function Home() {
  const me = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (!me) return
    api<Site[]>('/sites').then((sites) => {
      const remembered = sites.find((site) => site.id === lastSite.get())
      const site = remembered ?? sites[0]
      navigate(site ? `/sites/${site.id}/planning` : '/profil', { replace: true })
    })
  }, [me, navigate])

  return null
}
