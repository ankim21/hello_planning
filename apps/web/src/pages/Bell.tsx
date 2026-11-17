/**
 * The notification bell, shown in the header of both spaces.
 * Notifications live in the person's account, inside the application: a
 * published planning, a shift that changed, a leave request or its answer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api.ts'

interface Notification {
  id: string
  title: string
  body: string
  link: string
  createdAt: string
  readAt: string | null
}

/** How often the bell checks for something new while the page is open. */
const REFRESH_MS = 60_000

/** "à l'instant", "il y a 3 h", "hier", "le 12 nov." */
function when(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  if (minutes < 24 * 60) return `il y a ${Math.round(minutes / 60)} h`
  if (minutes < 48 * 60) return 'hier'
  return `le ${new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
}

export function Bell() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api<{ items: Notification[]; unread: number }>('/notifications')
      .then((data) => {
        setItems(data.items)
        setUnread(data.unread)
      })
      .catch(() => undefined) // the bell must never break the page
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

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

  async function openOne(notification: Notification) {
    setOpen(false)
    if (!notification.readAt) {
      await api(`/notifications/${notification.id}/read`, { method: 'POST', body: {} }).catch(
        () => undefined,
      )
      load()
    }
    navigate(notification.link)
  }

  async function readAll() {
    await api('/notifications/read-all', { method: 'POST', body: {} }).catch(() => undefined)
    load()
  }

  return (
    <div className="bell" ref={box}>
      <button
        className="bell-button"
        aria-label={unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          if (!open) load()
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.500 7 2.500 7h-17S6 15 6 9z" />
          <path d="M10 20a2.200 2.200 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && <button onClick={readAll}>Tout marquer comme lu</button>}
          </div>
          {items.length === 0 && <p className="bell-empty">Rien pour l'instant.</p>}
          <ul>
            {items.map((notification) => (
              <li key={notification.id}>
                <button
                  className={notification.readAt ? 'bell-item' : 'bell-item unread'}
                  onClick={() => openOne(notification)}
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                  <small>{when(notification.createdAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
