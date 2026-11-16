/**
 * Converts a wall-clock time at a site ("2026-11-16", "10:00", "Europe/Paris")
 * into an exact instant, taking summer and winter time into account.
 */

function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)!.value);
  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((wallClockAsUtc - at.getTime()) / 60_000);
}

/** `date` is YYYY-MM-DD and `time` is HH:MM, both as read on a clock at the site. */
export function zonedDateTime(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const asUtc = new Date(`${date}T${time}:00.000Z`);
  const firstGuess = new Date(
    asUtc.getTime() - offsetMinutes(asUtc, timeZone) * 60_000,
  );
  // Around a clock change the offset at the result can differ from the guess.
  return new Date(
    asUtc.getTime() - offsetMinutes(firstGuess, timeZone) * 60_000,
  );
}

/** Time of day (HH:MM) of an instant, as read on a clock at the site. */
export function localTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

/** Adds days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/**
 * Start and end instants of a shift given as wall-clock times on one day.
 * An end at or before the start means the shift finishes after midnight:
 * 16:30 → 00:30 ends on the following day.
 */
export function shiftInstants(
  date: string,
  start: string,
  end: string,
  timeZone: string,
): { startsAt: Date; endsAt: Date } {
  const endDate = end <= start ? addDays(date, 1) : date;
  return {
    startsAt: zonedDateTime(date, start, timeZone),
    endsAt: zonedDateTime(endDate, end, timeZone),
  };
}

/** Planned working time of a shift: its length minus its break. */
export function plannedMinutes(
  startsAt: Date,
  endsAt: Date,
  breakMinutes: number,
): number {
  const length = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  return Math.max(0, length - breakMinutes);
}
