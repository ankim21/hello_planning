/**
 * Turns what an employee clocked into the hours that count.
 *
 * This file is pure: no database, no HTTP, no "now". Everything it needs is
 * passed in, which is what makes every rule below testable in isolation.
 *
 * The rules come from docs/architecture.md, section 5.2.
 */

export interface HoursRules {
  /** A clock-out up to this many minutes after the planned end is not counted. */
  lateClockOutGraceMinutes: number;
  /** Break deducted from every shift, whatever its length. */
  automaticBreakMinutes: number;
}

export const DEFAULT_RULES: HoursRules = {
  lateClockOutGraceMinutes: 10,
  automaticBreakMinutes: 20,
};

export interface PlannedShift {
  id: string;
  start: Date;
  end: Date;
  /** True when the employee has an AM and a PM shift on the same day. */
  isCoupure: boolean;
  /** Break planned on this shift; the automatic break applies when absent. */
  breakMinutes?: number;
}

/** One clock-in with its clock-out (null when the employee forgot). */
export interface ClockPair {
  clockIn: Date;
  clockOut: Date | null;
  /** Minutes of break the employee clocked themselves, 0 if none. */
  clockedBreakMinutes: number;
}

/** Things the manager must look at on the correction page. */
export type Flag =
  | 'UNPLANNED' // clocked in with no planned shift
  | 'MISSING_CLOCK_OUT' // forgot to clock out
  | 'LATE_ARRIVAL'
  | 'EARLY_DEPARTURE'
  | 'LATE_DEPARTURE_COUNTED' // stayed beyond the grace period
  | 'LATE_DEPARTURE_NOT_COUNTED_COUPURE' // stayed late, ignored because coupure
  | 'CLOCKED_BREAK_DIFFERS'; // clocked a break that is not the automatic one

export interface ComputedEntry {
  shiftId: string | null;
  countedStart: Date;
  /** Null only when there is neither a clock-out nor a planned end. */
  countedEnd: Date | null;
  breakMinutes: number;
  /** Null when countedEnd is null. */
  workedMinutes: number | null;
  flags: Flag[];
}

const MINUTE = 60_000;

/** Seconds are dropped: 09:00:59 is 09:00. */
function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / MINUTE) * MINUTE);
}

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MINUTE);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE);
}

export function computeEntry(
  pair: ClockPair,
  shift: PlannedShift | null,
  rules: HoursRules = DEFAULT_RULES,
): ComputedEntry {
  const flags: Flag[] = [];
  const clockIn = floorToMinute(pair.clockIn);
  const clockOut = pair.clockOut ? floorToMinute(pair.clockOut) : null;

  let countedStart: Date;
  let countedEnd: Date | null;

  if (!shift) {
    // No planned shift: the clocked times are taken as they are and the
    // manager decides whether this was a fill-in.
    flags.push('UNPLANNED');
    countedStart = clockIn;
    countedEnd = clockOut;
    if (!clockOut) flags.push('MISSING_CLOCK_OUT');
  } else {
    // Start: arriving early gives no extra minutes; arriving late starts late.
    if (clockIn > shift.start) {
      countedStart = clockIn;
      flags.push('LATE_ARRIVAL');
    } else {
      countedStart = shift.start;
    }

    if (!clockOut) {
      // Forgotten clock-out: fall back to the planned end, and flag it.
      countedEnd = shift.end;
      flags.push('MISSING_CLOCK_OUT');
    } else if (clockOut < shift.end) {
      countedEnd = clockOut;
      flags.push('EARLY_DEPARTURE');
    } else {
      const overrun = minutesBetween(shift.end, clockOut);
      if (overrun === 0) {
        countedEnd = shift.end;
      } else if (shift.isCoupure) {
        // On a coupure a late clock-out never counts.
        countedEnd = shift.end;
        flags.push('LATE_DEPARTURE_NOT_COUNTED_COUPURE');
      } else if (overrun <= rules.lateClockOutGraceMinutes) {
        countedEnd = shift.end;
      } else {
        // Only the minutes beyond the grace period count: 14 late = 4 counted.
        countedEnd = addMinutes(
          shift.end,
          overrun - rules.lateClockOutGraceMinutes,
        );
        flags.push('LATE_DEPARTURE_COUNTED');
      }
    }
  }

  // The break planned on the shift is deducted (20 minutes unless the planner
  // changed it). A clocked break is reported to the manager but does not
  // change the deduction (open question in the spec:
  // HRS-3).
  const breakMinutes = shift?.breakMinutes ?? rules.automaticBreakMinutes;
  if (pair.clockedBreakMinutes > 0 && pair.clockedBreakMinutes !== breakMinutes) {
    flags.push('CLOCKED_BREAK_DIFFERS');
  }

  const workedMinutes =
    countedEnd === null
      ? null
      : Math.max(0, minutesBetween(countedStart, countedEnd) - breakMinutes);

  return {
    shiftId: shift?.id ?? null,
    countedStart,
    countedEnd,
    breakMinutes,
    workedMinutes,
    flags,
  };
}
