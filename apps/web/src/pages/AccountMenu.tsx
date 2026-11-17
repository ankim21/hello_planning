/**
 * The account button at the top right of every screen. Clicking it opens a
 * small menu: who is logged in, the profile, and logging out — either to
 * stop, or to log in again as someone else.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../api.ts'

export function AccountMenu({ name, email }: { name: string | null; email: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Two letters for the button: the person's initials, or the e-mail's start.
  const initials = name
    ? name
        .split(/\s+/)
        .map((part) => part.charAt(0))
        .join('')
        .slice(0, 2)
    : email.slice(0, 2)

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    navigate('/login')
  }

  return (
    <div className="account-menu" ref={box}>
      <button
        className="account-button"
        aria-label={`Mon compte : ${name ?? email}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {initials.toUpperCase()}
      </button>

      {open && (
        <div className="account-panel" role="menu">
          <div className="account-id">
            {name && <strong>{name}</strong>}
            <span>{email}</span>
          </div>
          <Link to="/moi/profil" role="menuitem" onClick={() => setOpen(false)}>
            Mon profil
          </Link>
          {/* Both end the session on this device; the wording says what comes next. */}
          <button role="menuitem" onClick={logout}>
            Se connecter avec un autre compte
          </button>
          <button role="menuitem" className="danger" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
