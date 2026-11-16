import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, ApiError, type Me } from '../api.ts'

/** The logged-in user, or a redirect to the login page when there is none. */
export function useMe(): Me | null {
  const navigate = useNavigate()
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    api<Me>('/auth/me')
      .then(setMe)
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) navigate('/login')
      })
  }, [navigate])

  return me
}
