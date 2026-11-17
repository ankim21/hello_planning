/**
 * The only place the web app talks to the server.
 * Every call goes to /api/..., sends the login cookie, and throws an ApiError
 * with the server's message when the answer is not a success.
 */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const DEVICE_TOKEN_KEY = 'planetbao.deviceToken'

/** The tablet's token lives in the browser's storage of that tablet. */
export const deviceToken = {
  get(): string | null {
    try {
      return localStorage.getItem(DEVICE_TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token)
      else localStorage.removeItem(DEVICE_TOKEN_KEY)
    } catch {
      // storage unavailable (private window): the tablet will ask again
    }
  },
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; asDevice?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.asDevice) headers['x-device-token'] = deviceToken.get() ?? ''

  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      response.status === 403
        ? "Vous n'avez pas les droits pour cette action."
        : Array.isArray(data?.message)
          ? data.message.join(', ')
          : (data?.message ?? response.statusText)
    throw new ApiError(response.status, message)
  }
  return data as T
}

// Shapes of the server's answers used by the pages.

export interface Grant {
  role: string
  siteId: string | null
}
export interface Me {
  id: string
  email: string
  employeeId: string | null
  grants: Grant[]
}
export interface Site {
  id: string
  name: string
  type: 'RESTAURANT' | 'LAB' | 'OFFICE'
  /** What the logged-in user may do on this site. */
  rights: { seeBadgeuse: boolean; manageTablets: boolean }
}
export interface Person {
  id: string
  firstName: string
  lastName: string
}
export type ClockKind = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'
// ───────────── Badgeuse ─────────────

/** What the manager validated for a row: the hours and meals to be paid. */
export interface Validation {
  id: string
  start: string // HH:MM at the site
  end: string
  breakMinutes: number
  workedMinutes: number
  meals: number
  corrected: boolean
  reason: string | null
}
/** One line of the Badgeuse: a planned shift, a clocking, or both. */
export interface BadgeRow {
  key: string
  employee: Person
  date: string
  shift: {
    id: string
    post: string
    service: 'AM' | 'PM'
    start: string
    end: string
    breakMinutes: number
    meals: number
  } | null
  clocked: {
    clockInAt: string // exact instant, identifies the clocking
    start: string
    end: string | null
    breakMinutes: number
  } | null
  /** What the company rules compute; null while nothing was clocked. */
  computed: {
    start: string
    end: string | null
    breakMinutes: number
    workedMinutes: number | null
    flags: string[]
  } | null
  inProgress: boolean
  validation: Validation | null
}
export interface HoursReport {
  date: string
  /** False for those who only have an overview (HR, operations team). */
  canValidate: boolean
  rows: BadgeRow[]
  absences: {
    id: string
    employee: Person
    typeName: string
    dayPart: 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM'
    startTime: string | null
    endTime: string | null
  }[]
  lastSyncAt: string | null
}
export interface BadgeDay {
  date: string
  rows: number
  validated: number
}

// ───────────── Planning ─────────────

export type Department = 'KITCHEN' | 'SALLE'
/** How much of a restaurant's week the staff can see. */
export type PublishedState = 'ALL' | 'PARTIAL' | 'NONE'
export type LockStatus = 'OPEN' | 'LOCKED' | 'PAYROLL'
export interface ShiftCard {
  id: string
  employeeId: string
  date: string // YYYY-MM-DD at the site
  start: string // HH:MM at the site
  end: string
  service: 'AM' | 'PM'
  postId: string
  postName: string
  color: string
  breakMinutes: number
  meals: number
  note: string | null
  minutes: number // planned working time, break deducted
}
export interface AbsenceCard {
  id: string
  employeeId: string
  absenceTypeId: string
  typeName: string
  startDate: string
  endDate: string
  dayPart: 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM'
  startTime: string | null
  endTime: string | null
  note: string | null
}
export interface PlanningRow {
  employee: Person
  contractMinutes: number | null
  plannedMinutes: number
  differenceMinutes: number | null
  shifts: ShiftCard[]
  absences: AbsenceCard[]
  /** Leave requests still waiting for a decision. */
  requests: { id: string; typeName: string; startDate: string; endDate: string }[]
}
export interface PlanningWeek {
  site: { id: string; name: string }
  /** What the logged-in user may change; everyone may look. */
  rights: {
    editShifts: boolean
    editAbsences: boolean
    lock: boolean
    /** The departments this person may publish. */
    publish: Department[]
  }
  /** When each department was published for the staff; only given for a week. */
  publication: Record<Department, string | null> | null
  days: { date: string; lock: LockStatus; people: number; minutes: number }[]
  rows: PlanningRow[]
  totalMinutes: number
  posts: { id: string; name: string; department: 'KITCHEN' | 'SALLE'; color: string }[]
  absenceTypes: { id: string; name: string; category: string }[]
}

// ───────────── Leave requests ─────────────

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REFUSED' | 'CANCELLED'
export interface LeaveRequest {
  id: string
  employee: Person
  site: { id: string; name: string }
  typeName: string
  startDate: string
  endDate: string
  dayPart: 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM'
  startTime: string | null
  endTime: string | null
  note: string | null
  route: 'DIRECTOR' | 'MULTI_SITE' | 'HR'
  status: LeaveStatus
  decisionNote: string | null
  createdAt: string
}
/** A request as an approver sees it, with what they may do. */
export interface InboxRequest extends LeaveRequest {
  plannedShifts: number
  canDecide: boolean
}

// ───────────── Mon espace (the employee's own view) ─────────────

export interface MySite {
  id: string
  name: string
  type: 'RESTAURANT' | 'LAB' | 'OFFICE'
  isPrimary: boolean
  nextShift: { date: string; start: string; end: string; postName: string } | null
}
export interface MeOverview {
  email: string
  grants: Grant[]
  /** True for people who also have the management screens. */
  hasManagement: boolean
  employee: {
    id: string
    firstName: string
    lastName: string
    contractMinutes: number | null
    forfaitJours: boolean
    sites: MySite[]
    posts: { id: string; name: string; color: string; department: 'KITCHEN' | 'SALLE' }[]
  } | null
}
export interface Coworker extends Person {
  postName: string
  color: string
}
export interface MyShift {
  id: string
  date: string
  start: string
  end: string
  site: { id: string; name: string }
  postName: string
  service: 'AM' | 'PM'
  color: string
  minutes: number
  coworkers: Coworker[]
}
export interface MyDay {
  date: string
  shifts: MyShift[]
  absences: {
    id: string
    typeName: string
    dayPart: 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM'
    startTime: string | null
    endTime: string | null
  }[]
  requests: { id: string; typeName: string }[]
}
export interface MyWeek {
  from: string
  days: MyDay[]
  totalMinutes: number
  contractMinutes: number | null
  bySite: { site: { id: string; name: string }; shifts: number; minutes: number }[]
  /** My restaurants, and whether each has published this week. */
  sites: { id: string; name: string; published: PublishedState }[]
  nextShift: MyShift | null
}
export interface SiteLine {
  id: string
  date: string
  start: string
  end: string
  service: 'AM' | 'PM'
  postName: string
  color: string
  department: 'KITCHEN' | 'SALLE'
  employee: Person
  isMe: boolean
}
export interface SiteWeek {
  site: { id: string; name: string }
  published: PublishedState
  days: { date: string; lines: SiteLine[] }[]
}
