// Small date helpers. Dates are YYYY-MM-DD strings, so no timezone can shift
// them by a day. Labels are in French.

const pad = (n: number) => String(n).padStart(2, '0')

const toDate = (day: string) => new Date(`${day}T12:00:00Z`)
const toDay = (date: Date) => date.toISOString().slice(0, 10)

export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(day: string, days: number): string {
  const date = toDate(day)
  date.setUTCDate(date.getUTCDate() + days)
  return toDay(date)
}

/** The Monday of the week that contains `day`. */
export function mondayOf(day: string): string {
  const weekday = (toDate(day).getUTCDay() + 6) % 7 // Monday = 0
  return addDays(day, -weekday)
}

export const isMonday = (day: string) => toDate(day).getUTCDay() === 1

export const firstOfMonth = (day: string) => `${day.slice(0, 7)}-01`

/** First day of the month `months` away from the month of `day`. */
export function addMonths(day: string, months: number): string {
  const date = toDate(firstOfMonth(day))
  date.setUTCMonth(date.getUTCMonth() + months)
  return toDay(date)
}

export function daysInMonth(day: string): number {
  const next = toDate(addMonths(day, 1))
  next.setUTCDate(0) // last day of the previous month
  return next.getUTCDate()
}

/** ISO week number, as printed on French calendars ("Semaine 47"). */
export function weekNumber(monday: string): number {
  const thursday = toDate(addDays(monday, 3))
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

export function dayLabel(day: string, options: Intl.DateTimeFormatOptions): string {
  return toDate(day).toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' })
}

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** 460 → "7h40". */
export function hours(minutes: number): string {
  const sign = minutes < 0 ? '-' : ''
  const abs = Math.abs(minutes)
  return `${sign}${Math.floor(abs / 60)}h${pad(abs % 60)}`
}

/** Minutes between two HH:MM times; an end at or before the start is next day. */
export function minutesBetween(start: string, end: string): number {
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const length = toMinutes(end) - toMinutes(start)
  return length <= 0 ? length + 24 * 60 : length
}
