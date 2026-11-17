/**
 * Company rules that give a shift or an absence its default values.
 * Stated by the owner on 2026-11-17.
 */

/** Break deducted from a shift unless a rule below says otherwise. */
export const DEFAULT_BREAK_MINUTES = 20;
export const DEFAULT_MEALS = 1;

/**
 * A shift that starts at one of these times starts after the staff meal:
 * no meal, and no break included.
 */
export const STARTS_WITHOUT_BREAK = ['12:00', '19:00'];

/** The break and the number of meals a shift gets, from its start time (HH:MM). */
export function shiftDefaults(start: string): { breakMinutes: number; meals: number } {
  return STARTS_WITHOUT_BREAK.includes(start)
    ? { breakMinutes: 0, meals: 0 }
    : { breakMinutes: DEFAULT_BREAK_MINUTES, meals: DEFAULT_MEALS };
}

/**
 * Everyone earns 2.08 days of paid leave a month whatever their hours, so a
 * day off is counted on a five-day week: it is worth a fifth of the contract.
 */
export const CONTRACT_DAYS_PER_WEEK = 5;
/** Paid leave earned per month, in days, by every employee. */
export const PAID_LEAVE_DAYS_PER_MONTH = 2.08;

/**
 * What an absence is worth in minutes, for one day.
 *   - a whole day: a fifth of the weekly contract (35h → 7h, 39h → 7h48);
 *   - half a day: half of that;
 *   - exact hours: the time between them.
 * Returns null when the person has no weekly hours (forfait jours).
 */
export function absenceDayMinutes(
  weeklyContractMinutes: number | null,
  dayPart: 'FULL_DAY' | 'HALF_DAY' | 'CUSTOM',
  startTime?: string | null,
  endTime?: string | null,
): number | null {
  if (dayPart === 'CUSTOM' && startTime && endTime) {
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const length = minutes(endTime) - minutes(startTime);
    return length <= 0 ? length + 24 * 60 : length; // an end before the start is next day
  }
  if (weeklyContractMinutes === null) return null;
  const day = Math.round(weeklyContractMinutes / CONTRACT_DAYS_PER_WEEK);
  return dayPart === 'HALF_DAY' ? Math.round(day / 2) : day;
}

/**
 * Hours that absences add to a counter over a period.
 *
 * Paid leave is counted on a five-day week, so at most five days count in any
 * one week: a leave from Monday to Sunday is worth one week of contract, not
 * seven days.
 *
 * @param dates    the days of the period (YYYY-MM-DD)
 * @param absences the absences that count, with what one day of each is worth
 */
export function countedAbsenceMinutes(
  dates: string[],
  absences: { startDate: string; endDate: string; dayMinutes: number | null }[],
): number {
  // What each day of the period is worth, grouped by week.
  const weeks = new Map<string, number[]>();
  for (const date of dates) {
    const worth = absences
      .filter((a) => a.dayMinutes !== null && a.startDate <= date && date <= a.endDate)
      .map((a) => a.dayMinutes!);
    if (worth.length === 0) continue;
    const day = new Date(`${date}T00:00:00.000Z`);
    const monday = new Date(day);
    monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weeks.set(key, [...(weeks.get(key) ?? []), Math.max(...worth)]);
  }
  let total = 0;
  for (const days of weeks.values()) {
    total += days
      .sort((a, b) => b - a)
      .slice(0, CONTRACT_DAYS_PER_WEEK)
      .reduce((sum, minutes) => sum + minutes, 0);
  }
  return total;
}
