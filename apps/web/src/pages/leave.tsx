// Wording shared by the pages that show leave requests.
import type { LeaveRequest, LeaveStatus } from '../api.ts'
import { dayLabel } from './dates.ts'

export const STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REFUSED: 'Refusée',
  CANCELLED: 'Annulée',
}

export const ROUTE_LABELS: Record<LeaveRequest['route'], string> = {
  DIRECTOR: 'le responsable de site',
  CHEF: 'le chef de cuisine',
  MULTI_SITE: 'le responsable multisite',
  HR: 'les ressources humaines',
}

/** "du 24 nov. au 27 nov. 2026", or "le 30 nov. 2026 (demi-journée)". */
export function periodLabel(request: LeaveRequest): string {
  const long = { day: 'numeric', month: 'short', year: 'numeric' } as const
  if (request.startDate !== request.endDate) {
    return `du ${dayLabel(request.startDate, { day: 'numeric', month: 'short' })} au ${dayLabel(request.endDate, long)}`
  }
  const detail =
    request.dayPart === 'HALF_DAY'
      ? ' (demi-journée)'
      : request.dayPart === 'CUSTOM'
        ? ` (${request.startTime} – ${request.endTime})`
        : ''
  return `le ${dayLabel(request.startDate, long)}${detail}`
}

export function StatusBadge({ status }: { status: LeaveStatus }) {
  return <span className={`state leave-${status}`}>{STATUS_LABELS[status]}</span>
}
