/**
 * Groups raw clock events into clock-in / clock-out pairs, and decides which
 * planned shift each pair belongs to. Pure functions, like time-entry.ts.
 */
import type { ClockPair, PlannedShift } from './time-entry.js';

export type ClockKind = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END';

export interface ClockEventLike {
  kind: ClockKind;
  at: Date;
}

/**
 * A clock-in with no clock-out after this many hours is treated as a forgotten
 * clock-out, so the employee is offered "clock in" again the next day.
 * 16 hours is a technical safety value, longer than any working day.
 */
export const STALE_OPEN_PAIR_HOURS = 16;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface PairingResult {
  pairs: ClockPair[];
  /** Clock-outs that had no clock-in before them. */
  orphanClockOuts: Date[];
}

/** `events` must belong to one employee and be sorted oldest first. */
export function pairClockEvents(events: ClockEventLike[]): PairingResult {
  const pairs: ClockPair[] = [];
  const orphanClockOuts: Date[] = [];

  let open: ClockPair | null = null;
  let breakStartedAt: Date | null = null;

  const closeBreak = (at: Date) => {
    if (open && breakStartedAt) {
      open.clockedBreakMinutes += Math.round(
        (at.getTime() - breakStartedAt.getTime()) / MINUTE,
      );
    }
    breakStartedAt = null;
  };

  for (const event of events) {
    switch (event.kind) {
      case 'IN':
        // A second clock-in means the previous clock-out was forgotten.
        if (open) pairs.push(open);
        open = { clockIn: event.at, clockOut: null, clockedBreakMinutes: 0 };
        breakStartedAt = null;
        break;
      case 'OUT':
        if (!open) {
          orphanClockOuts.push(event.at);
          break;
        }
        closeBreak(event.at); // a break still running ends at clock-out
        open.clockOut = event.at;
        pairs.push(open);
        open = null;
        break;
      case 'BREAK_START':
        if (open && !breakStartedAt) breakStartedAt = event.at;
        break;
      case 'BREAK_END':
        closeBreak(event.at);
        break;
    }
  }
  if (open) pairs.push(open);

  return { pairs, orphanClockOuts };
}

/** What the tablet should offer this employee right now. */
export function nextActions(
  events: ClockEventLike[],
  now: Date,
): ClockKind[] {
  let clockedInAt: Date | null = null;
  let onBreak = false;
  for (const event of events) {
    if (event.kind === 'IN') {
      clockedInAt = event.at;
      onBreak = false;
    } else if (event.kind === 'OUT') {
      clockedInAt = null;
      onBreak = false;
    } else if (event.kind === 'BREAK_START') {
      onBreak = clockedInAt !== null;
    } else {
      onBreak = false;
    }
  }

  const stale =
    clockedInAt !== null &&
    now.getTime() - clockedInAt.getTime() > STALE_OPEN_PAIR_HOURS * HOUR;

  if (clockedInAt === null || stale) return ['IN'];
  if (onBreak) return ['BREAK_END'];
  return ['BREAK_START', 'OUT'];
}

/**
 * With no clock-out there is no way to know how long the employee stayed, so
 * a clock-in only counts for a shift that starts within this many hours.
 * Without it, an evening clock-in would be attached to tomorrow's shift.
 */
export const MAX_EARLY_ARRIVAL_HOURS = 4;

/**
 * Picks the planned shift a clock pair belongs to: the earliest shift, not
 * already taken, that the pair overlaps in time. Arriving early for a shift
 * counts as overlapping it as long as the employee is still there when it
 * starts. No overlap means the pair is unplanned.
 */
export function matchShift(
  pair: ClockPair,
  availableShifts: PlannedShift[],
): PlannedShift | null {
  const candidates = [...availableShifts].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  for (const shift of candidates) {
    const startsBeforeShiftEnds = pair.clockIn < shift.end;
    const endsAfterShiftStarts =
      pair.clockOut === null
        ? shift.start.getTime() - pair.clockIn.getTime() <=
          MAX_EARLY_ARRIVAL_HOURS * HOUR
        : pair.clockOut > shift.start;
    if (startsBeforeShiftEnds && endsAfterShiftStarts) return shift;
  }
  return null;
}

/** Calendar date (YYYY-MM-DD) of an instant, as seen in the site's timezone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
