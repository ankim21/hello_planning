// Small building blocks shared by the Mon espace screens.
import type { CSSProperties, ReactNode } from 'react'
import type { Person } from '../api.ts'
import { addDays, dayLabel, today, weekNumber } from '../pages/dates.ts'

/** A stable colour per person, so the same colleague always looks the same. */
function hueOf(text: string): number {
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

export function Avatar({ person, size = 32 }: { person: Person; size?: number }) {
  const name = `${person.firstName} ${person.lastName}`
  return (
    <span
      className="avatar"
      title={name}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${hueOf(name)} 48% 42%)`,
      }}
    >
      {person.firstName.charAt(0)}
      {person.lastName.charAt(0)}
    </span>
  )
}

/** Up to four faces, then "+3". */
export function AvatarStack({ people }: { people: Person[] }) {
  const shown = people.slice(0, 4)
  return (
    <span className="avatar-stack">
      {shown.map((person) => (
        <Avatar key={person.id} person={person} size={26} />
      ))}
      {people.length > shown.length && (
        <span className="avatar more" style={{ width: 26, height: 26, fontSize: 10 }}>
          +{people.length - shown.length}
        </span>
      )}
    </span>
  )
}

/** A post, with its planning colour. */
export function PostChip({ name, color, service }: { name: string; color: string; service?: string }) {
  return (
    <span className="post-chip" style={{ '--post': color } as CSSProperties}>
      <span className="post-dot" />
      {name}
      {service && <span className="post-service">{service}</span>}
    </span>
  )
}

/** "Aujourd'hui", "Demain", or "mercredi 18 nov." */
export function relativeDay(date: string): string {
  if (date === today()) return "Aujourd'hui"
  if (date === addDays(today(), 1)) return 'Demain'
  return dayLabel(date, { weekday: 'long', day: 'numeric', month: 'short' })
}

/** "Bob", "Bob et Chloé", "Bob, Chloé et 2 autres". */
export function namesOf(people: Person[]): string {
  const first = people.map((person) => person.firstName)
  if (first.length <= 2) return first.join(' et ')
  const rest = first.length - 2
  return `${first[0]}, ${first[1]} et ${rest} autre${rest > 1 ? 's' : ''}`
}

/** Previous / next week, with the week's dates in the middle. */
export function WeekNav({ monday, onChange }: { monday: string; onChange: (monday: string) => void }) {
  const thisWeek = monday <= today() && today() <= addDays(monday, 6)
  return (
    <div className="week-bar">
      <button className="round" onClick={() => onChange(addDays(monday, -7))} aria-label="Semaine précédente">
        ‹
      </button>
      <div className="week-label">
        <strong>
          {dayLabel(monday, { day: 'numeric', month: 'short' })} –{' '}
          {dayLabel(addDays(monday, 6), { day: 'numeric', month: 'short' })}
        </strong>
        <span>{thisWeek ? 'Cette semaine' : `Semaine ${weekNumber(monday)}`}</span>
      </div>
      <button className="round" onClick={() => onChange(addDays(monday, 7))} aria-label="Semaine suivante">
        ›
      </button>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  )
}

// Icons of the navigation, drawn as simple outlines.
const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)
export const WeekIcon = () =>
  icon(
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>,
  )
export const TeamIcon = () =>
  icon(
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.900 1.600 5.500 4.600" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M16.500 13.600c2.200.2 3.600 1.600 4 4" />
    </>,
  )
export const LeaveIcon = () =>
  icon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.500v2.500M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800" />
    </>,
  )
export const ProfileIcon = () =>
  icon(
    <>
      <circle cx="12" cy="8.500" r="3.800" />
      <path d="M4.500 20c.9-3.600 3.800-5.500 7.500-5.500s6.600 1.900 7.500 5.500" />
    </>,
  )
export const PinIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-6.500-5.600-6.500-10.500a6.500 6.500 0 0 1 13 0C18.500 15.400 12 21 12 21z" />
    <circle cx="12" cy="10.500" r="2.200" />
  </svg>
)
