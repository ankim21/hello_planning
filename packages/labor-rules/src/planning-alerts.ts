/**
 * Alerts on one employee's planned week. They only warn: nothing here ever
 * blocks a planning.
 *
 * Where each threshold comes from is noted next to it. The ones marked
 * "to validate" must be confirmed by HR before being relied on.
 */
import { addDays } from './zoned-time.js';

export const ALERT_LIMITS = {
  /** HR payroll checks, P1: at least two consecutive days off per week. */
  consecutiveRestDays: 2,
  /** 46 hours a week: HR payroll checks, P2, confirmed by the owner on 2026-11-17. */
  weeklyMaxMinutes: 46 * 60,
  /** French labour code: 11 consecutive hours of rest between two days. To validate for HCR. */
  dailyRestMinutes: 11 * 60,
};

export type AlertKind =
  | 'REST_DAYS' // fewer than two consecutive days off
  | 'WEEKLY_MAX' // more than the weekly maximum
  | 'DAILY_REST' // not enough rest between two days
  | 'SHIFT_ON_ABSENCE'; // planned on a day off or a leave

export interface Alert {
  kind: AlertKind;
  /** The day concerned, when the alert is about one day. */
  date?: string;
  /** Numbers for the message: minutes planned, minutes of rest… */
  minutes?: number;
  /** For SHIFT_ON_ABSENCE: the type of absence. */
  detail?: string;
}

export interface WeekShift {
  /** Day the shift starts, at the site (YYYY-MM-DD). */
  date: string;
  startsAt: Date;
  endsAt: Date;
  /** Planned working time, break deducted. */
  minutes: number;
}

export interface WeekAbsence {
  startDate: string;
  endDate: string;
  typeName: string;
}

/**
 * @param monday   first day of the week checked
 * @param shifts   every shift of the employee that week, at every restaurant,
 *                 plus the ones of the day before (to check the rest before Monday)
 * @param absences the employee's absences overlapping the week
 */
export function planningAlerts(
  monday: string,
  shifts: WeekShift[],
  absences: WeekAbsence[],
): Alert[] {
  const alerts: Alert[] = [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const ofWeek = shifts.filter((shift) => days.includes(shift.date));
  if (ofWeek.length === 0) return alerts; // nothing planned, nothing to check

  // Two consecutive days off within the week.
  const worked = days.map((day) => ofWeek.some((shift) => shift.date === day));
  let longestRest = 0;
  let run = 0;
  for (const isWorked of worked) {
    run = isWorked ? 0 : run + 1;
    longestRest = Math.max(longestRest, run);
  }
  if (longestRest < ALERT_LIMITS.consecutiveRestDays) {
    alerts.push({ kind: 'REST_DAYS' });
  }

  // Weekly maximum.
  const total = ofWeek.reduce((sum, shift) => sum + shift.minutes, 0);
  if (total > ALERT_LIMITS.weeklyMaxMinutes) {
    alerts.push({ kind: 'WEEKLY_MAX', minutes: total });
  }

  // Rest between the last shift of a day and the first of the next worked day.
  const sorted = [...shifts].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const next = sorted[i];
    if (previous.date === next.date) continue; // same day: a coupure, not a night
    if (!days.includes(next.date)) continue;
    const rest = Math.round((next.startsAt.getTime() - previous.endsAt.getTime()) / 60_000);
    if (rest < ALERT_LIMITS.dailyRestMinutes) {
      alerts.push({ kind: 'DAILY_REST', date: next.date, minutes: rest });
    }
  }

  // A shift on a day covered by an absence (a leave, a weekly rest…).
  for (const day of days) {
    const absence = absences.find((a) => a.startDate <= day && day <= a.endDate);
    if (absence && ofWeek.some((shift) => shift.date === day)) {
      alerts.push({ kind: 'SHIFT_ON_ABSENCE', date: day, detail: absence.typeName });
    }
  }

  return alerts;
}
