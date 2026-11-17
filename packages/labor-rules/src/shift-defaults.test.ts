import { describe, expect, it } from 'vitest';
import { absenceDayMinutes, countedAbsenceMinutes, shiftDefaults } from './shift-defaults.js';

describe('shiftDefaults', () => {
  it('gives a 20-minute break and one meal to an ordinary shift', () => {
    expect(shiftDefaults('10:00')).toEqual({ breakMinutes: 20, meals: 1 });
    expect(shiftDefaults('18:00')).toEqual({ breakMinutes: 20, meals: 1 });
  });

  it('gives no break and no meal to a shift starting at 12:00 or 19:00', () => {
    expect(shiftDefaults('12:00')).toEqual({ breakMinutes: 0, meals: 0 });
    expect(shiftDefaults('19:00')).toEqual({ breakMinutes: 0, meals: 0 });
  });

  it('only applies to those exact start times', () => {
    expect(shiftDefaults('12:30').breakMinutes).toBe(20);
    expect(shiftDefaults('18:30').breakMinutes).toBe(20);
  });
});

describe('absenceDayMinutes', () => {
  it('is worth 7 hours a day on a 35-hour contract', () => {
    expect(absenceDayMinutes(35 * 60, 'FULL_DAY')).toBe(420);
  });

  it('is worth 7h48 a day on a 39-hour contract', () => {
    expect(absenceDayMinutes(39 * 60, 'FULL_DAY')).toBe(468); // 7.8 hours
  });

  it('is worth 5 hours a day on a 25-hour contract', () => {
    expect(absenceDayMinutes(25 * 60, 'FULL_DAY')).toBe(300);
  });

  it('halves for half a day', () => {
    expect(absenceDayMinutes(35 * 60, 'HALF_DAY')).toBe(210);
  });

  it('uses the hours given for exact hours', () => {
    expect(absenceDayMinutes(35 * 60, 'CUSTOM', '10:30', '11:30')).toBe(60);
  });

  it('has no value on forfait jours', () => {
    expect(absenceDayMinutes(null, 'FULL_DAY')).toBeNull();
  });
});

describe('countedAbsenceMinutes', () => {
  const week = ['16', '17', '18', '19', '20', '21', '22'].map((d) => `2026-11-${d}`); // Mon → Sun
  const leave = (startDate: string, endDate: string, dayMinutes: number | null = 468) => ({
    startDate,
    endDate,
    dayMinutes,
  });

  it('counts each day of a short leave', () => {
    expect(countedAbsenceMinutes(week, [leave('2026-11-17', '2026-11-18')])).toBe(936);
  });

  it('counts a week of leave as one week of contract, not seven days', () => {
    // Monday to Sunday on a 39-hour contract: 5 × 7h48 = 39 hours.
    expect(countedAbsenceMinutes(week, [leave('2026-11-16', '2026-11-22')])).toBe(39 * 60);
  });

  it('applies the five-day limit to each week separately', () => {
    const twoWeeks = [...week, ...['23', '24', '25', '26', '27', '28', '29'].map((d) => `2026-11-${d}`)];
    expect(countedAbsenceMinutes(twoWeeks, [leave('2026-11-16', '2026-11-29')])).toBe(78 * 60);
  });

  it('only counts the days inside the period', () => {
    expect(countedAbsenceMinutes(week, [leave('2026-11-10', '2026-11-17')])).toBe(936);
  });

  it('counts nothing for someone on forfait jours', () => {
    expect(countedAbsenceMinutes(week, [leave('2026-11-16', '2026-11-18', null)])).toBe(0);
  });
});
