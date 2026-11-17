import { describe, expect, it } from 'vitest';
import { computeEntry, type PlannedShift } from './time-entry.js';
import { matchShift, nextActions, pairClockEvents } from './pairing.js';

/** Builds a time on an arbitrary day: t('10:00'). */
const t = (hhmm: string, day = 16) =>
  new Date(`2026-11-${day}T${hhmm}:00.000Z`);

const shift = (start: string, end: string, endsBeforeBreak = false): PlannedShift => ({
  id: 'shift-1',
  start: t(start),
  end: t(end),
  endsBeforeBreak,
});

const pair = (clockIn: string, clockOut: string | null, breakMin = 0) => ({
  clockIn: t(clockIn),
  clockOut: clockOut ? t(clockOut) : null,
  clockedBreakMinutes: breakMin,
});

describe('computeEntry — start of shift', () => {
  it('clocking in early gives no extra minutes', () => {
    const entry = computeEntry(pair('09:45', '15:00'), shift('10:00', '15:00'));
    expect(entry.countedStart).toEqual(t('10:00'));
    expect(entry.flags).toEqual([]);
  });

  it('clocking in late starts at the late time', () => {
    const entry = computeEntry(pair('10:07', '15:00'), shift('10:00', '15:00'));
    expect(entry.countedStart).toEqual(t('10:07'));
    expect(entry.flags).toContain('LATE_ARRIVAL');
  });
});

describe('computeEntry — end of shift', () => {
  it('leaving early ends at the actual time', () => {
    const entry = computeEntry(pair('10:00', '14:30'), shift('10:00', '15:00'));
    expect(entry.countedEnd).toEqual(t('14:30'));
    expect(entry.flags).toContain('EARLY_DEPARTURE');
  });

  it('the first 10 minutes late do not count', () => {
    const entry = computeEntry(pair('10:00', '15:10'), shift('10:00', '15:00'));
    expect(entry.countedEnd).toEqual(t('15:00'));
    expect(entry.flags).toEqual([]);
  });

  it('the 11th minute counts as 1', () => {
    const entry = computeEntry(pair('10:00', '15:11'), shift('10:00', '15:00'));
    expect(entry.countedEnd).toEqual(t('15:01'));
    expect(entry.flags).toContain('LATE_DEPARTURE_COUNTED');
  });

  it('14 minutes late counts as 4', () => {
    const entry = computeEntry(pair('10:00', '15:14'), shift('10:00', '15:00'));
    expect(entry.countedEnd).toEqual(t('15:04'));
  });

  it('before the break of a coupure a late clock-out never counts', () => {
    const entry = computeEntry(
      pair('10:00', '15:45'),
      shift('10:00', '15:00', true),
    );
    expect(entry.countedEnd).toEqual(t('15:00'));
    expect(entry.flags).toContain('LATE_DEPARTURE_NOT_COUNTED_COUPURE');
  });

  it('at the end of a coupure day the usual tolerance applies', () => {
    // The evening service of a coupure: 16 minutes late pays 6.
    const evening = shift('18:00', '23:00', false);
    expect(computeEntry(pair('18:00', '23:16'), evening).countedEnd).toEqual(t('23:06'));
    expect(computeEntry(pair('18:00', '23:09'), evening).countedEnd).toEqual(t('23:00'));
  });

  it('a forgotten clock-out falls back to the planned end, flagged', () => {
    const entry = computeEntry(pair('10:00', null), shift('10:00', '15:00'));
    expect(entry.countedEnd).toEqual(t('15:00'));
    expect(entry.flags).toContain('MISSING_CLOCK_OUT');
  });
});

describe('computeEntry — breaks and totals', () => {
  it('deducts 20 minutes from every shift', () => {
    const entry = computeEntry(pair('10:00', '15:00'), shift('10:00', '15:00'));
    expect(entry.breakMinutes).toBe(20);
    expect(entry.workedMinutes).toBe(280); // 5h - 20min
  });

  it('uses the break the planner set on the shift', () => {
    const entry = computeEntry(pair('10:00', '15:00'), {
      ...shift('10:00', '15:00'),
      breakMinutes: 30,
    });
    expect(entry.workedMinutes).toBe(270);
  });

  it('never goes below zero on a very short shift', () => {
    const entry = computeEntry(pair('10:00', '10:10'), shift('10:00', '15:00'));
    expect(entry.workedMinutes).toBe(0);
  });

  it('flags a clocked break that differs from the automatic one', () => {
    const entry = computeEntry(
      pair('10:00', '15:00', 35),
      shift('10:00', '15:00'),
    );
    expect(entry.breakMinutes).toBe(20);
    expect(entry.flags).toContain('CLOCKED_BREAK_DIFFERS');
  });
});

describe('computeEntry — no planned shift', () => {
  it('records the clocked times with a warning', () => {
    const entry = computeEntry(pair('11:03', '14:58'), null);
    expect(entry.countedStart).toEqual(t('11:03'));
    expect(entry.countedEnd).toEqual(t('14:58'));
    expect(entry.flags).toEqual(['UNPLANNED']);
  });

  it('stays open when the clock-out is also missing', () => {
    const entry = computeEntry(pair('11:03', null), null);
    expect(entry.countedEnd).toBeNull();
    expect(entry.workedMinutes).toBeNull();
    expect(entry.flags).toEqual(['UNPLANNED', 'MISSING_CLOCK_OUT']);
  });
});

describe('pairClockEvents', () => {
  it('pairs a simple in / out', () => {
    const { pairs } = pairClockEvents([
      { kind: 'IN', at: t('10:00') },
      { kind: 'OUT', at: t('15:00') },
    ]);
    expect(pairs).toEqual([pair('10:00', '15:00')]);
  });

  it('adds up clocked breaks', () => {
    const { pairs } = pairClockEvents([
      { kind: 'IN', at: t('10:00') },
      { kind: 'BREAK_START', at: t('12:00') },
      { kind: 'BREAK_END', at: t('12:25') },
      { kind: 'OUT', at: t('15:00') },
    ]);
    expect(pairs[0].clockedBreakMinutes).toBe(25);
  });

  it('treats a second clock-in as a forgotten clock-out', () => {
    const { pairs } = pairClockEvents([
      { kind: 'IN', at: t('10:00') },
      { kind: 'IN', at: t('18:00') },
      { kind: 'OUT', at: t('23:00') },
    ]);
    expect(pairs).toEqual([pair('10:00', null), pair('18:00', '23:00')]);
  });

  it('reports a clock-out with no clock-in', () => {
    const { pairs, orphanClockOuts } = pairClockEvents([
      { kind: 'OUT', at: t('15:00') },
    ]);
    expect(pairs).toEqual([]);
    expect(orphanClockOuts).toEqual([t('15:00')]);
  });
});

describe('nextActions', () => {
  it('offers clock-in when nothing is open', () => {
    expect(nextActions([], t('10:00'))).toEqual(['IN']);
  });

  it('offers break or clock-out once clocked in', () => {
    expect(nextActions([{ kind: 'IN', at: t('10:00') }], t('12:00'))).toEqual([
      'BREAK_START',
      'OUT',
    ]);
  });

  it('offers only end-of-break during a break', () => {
    expect(
      nextActions(
        [
          { kind: 'IN', at: t('10:00') },
          { kind: 'BREAK_START', at: t('12:00') },
        ],
        t('12:10'),
      ),
    ).toEqual(['BREAK_END']);
  });

  it('offers clock-in again the day after a forgotten clock-out', () => {
    expect(
      nextActions([{ kind: 'IN', at: t('10:00', 16) }], t('10:00', 17)),
    ).toEqual(['IN']);
  });
});

describe('matchShift', () => {
  const am = { ...shift('10:00', '15:00', true), id: 'am' };
  const pm = { ...shift('18:00', '23:00', true), id: 'pm' };

  it('matches an early arrival to the shift it stays for', () => {
    expect(matchShift(pair('09:40', '15:02'), [am, pm])?.id).toBe('am');
  });

  it('matches the evening service to the PM shift', () => {
    expect(matchShift(pair('17:55', '23:05'), [am, pm])?.id).toBe('pm');
  });

  it('does not attach an open clock-in to a shift far in the future', () => {
    const tomorrow = { ...shift('10:00', '15:00'), id: 'tomorrow' };
    tomorrow.start = t('10:00', 17);
    tomorrow.end = t('15:00', 17);
    expect(matchShift(pair('19:00', null), [tomorrow])).toBeNull();
  });

  it('attaches an open clock-in to the shift about to start', () => {
    expect(matchShift(pair('17:40', null), [am, pm])?.id).toBe('pm');
  });

  it('returns nothing when the pair overlaps no shift', () => {
    expect(matchShift(pair('15:30', '17:00'), [am, pm])).toBeNull();
  });
});
