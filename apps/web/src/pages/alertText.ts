import type { PlanningAlert } from '../api.ts'
import { dayLabel, hours } from './dates.ts'

/** One planning alert, as a sentence. Alerts warn; they never block. */
export function alertText(alert: PlanningAlert): string {
  const day = alert.date
    ? dayLabel(alert.date, { weekday: 'long', day: 'numeric', month: 'short' })
    : ''
  switch (alert.kind) {
    case 'REST_DAYS':
      return 'Pas deux jours de repos consécutifs dans la semaine'
    case 'WEEKLY_MAX':
      return `${hours(alert.minutes ?? 0)} planifiées : plus de 46h dans la semaine`
    case 'DAILY_REST':
      return `Seulement ${hours(alert.minutes ?? 0)} de repos avant le ${day} (11h attendues)`
    case 'SHIFT_ON_ABSENCE':
      return `Shift planifié le ${day} malgré : ${alert.detail}`
  }
}
