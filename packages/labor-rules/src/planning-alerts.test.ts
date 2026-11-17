import { describe, expect, it } from 'vitest';
import { planningAlerts, type WeekShift } from './planning-alerts.js';

const MONDAY = '2026-11-16';

/** A shift on a day of the test week (0 = Monday), in UTC for simplicity. */
function shift(dayIndex: number, start: string, end: string, minutes?: number): WeekShift {
  const date = new Date(`${MONDAY}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayIndex);
  const day = date.toISOString().slice(0, 10);
  const startsAt = new Date(`${day}T${start}:00.000Z`);
  const endsAt = new Date(`${day}T${end}:00.000Z`);
  if (endsAt <= startsAt) endsAt.setUTCDate(endsAt.getUTCDate() + 1); // past midnight
  return {
    date: day,
    startsAt,
    endsAt,
    minutes: minutes ?? Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000) - 20,
  };
}
const kinds = (shifts: WeekShift[], absences = []) =>
  planningAlerts(MONDAY, shifts, absences).map((alert) => alert.kind);

describe('planningAlerts', () => {
  it('says nothing about a normal week', () => {
    // Five days of work, Saturday and Sunday off.
    const week = [0, 1, 2, 3, 4].map((day) => shift(day, '10:00', '17:00'));
    expect(kinds(week)).toEqual([]);
  });

  it('says nothing when nothing is planned', () => {
    expect(kinds([])).toEqual([]);
  });

  it('warns when there are not two consecutive days off', () => {
    // Off on Wednesday and Sunday only: two days off, but not in a row.
    const week = [0, 1, 3, 4, 5].map((day) => shift(day, '10:00', '15:00'));
    expect(kinds(week)).toContain('REST_DAYS');
  });

  it('accepts two consecutive days off in the middle of the week', () => {
    const week = [0, 1, 4, 5, 6].map((day) => shift(day, '10:00', '15:00'));
    expect(kinds(week)).not.toContain('REST_DAYS');
  });

  it('warns above 46 hours in the week', () => {
    // 5 days of 9h30 planned = 47h30.
    const week = [0, 1, 2, 3, 4].map((day) => shift(day, '09:00', '19:00', 570));
    const alert = planningAlerts(MONDAY, week, []).find((a) => a.kind === 'WEEKLY_MAX');
    expect(alert?.minutes).toBe(2850);
  });

  it('does not warn at exactly 46 hours', () => {
    const week = [0, 1, 2, 3].map((day) => shift(day, '09:00', '21:00', 690)); // 4 x 11h30
    expect(kinds(week)).not.toContain('WEEKLY_MAX');
  });

  it('warns when less than 11 hours separate two days', () => {
    // Ends at 00:30, starts again at 10:00: 9h30 of rest.
    const alert = planningAlerts(
      MONDAY,
      [shift(0, '17:00', '00:30'), shift(1, '10:00', '15:00')],
      [],
    ).find((a) => a.kind === 'DAILY_REST');
    expect(alert).toMatchObject({ date: '2026-11-17', minutes: 570 });
  });

  it('does not count the break of a coupure as a night', () => {
    const coupure = [shift(0, '10:00', '15:00'), shift(0, '18:00', '23:00')];
    expect(kinds(coupure)).not.toContain('DAILY_REST');
  });

  it('checks the rest before Monday using the Sunday before', () => {
    const sunday = shift(-1, '18:00', '00:30');
    expect(kinds([sunday, shift(0, '09:00', '15:00')])).toContain('DAILY_REST');
  });

  it('warns about a shift planned on a leave', () => {
    const alerts = planningAlerts(
      MONDAY,
      [shift(2, '10:00', '15:00')],
      [{ startDate: '2026-11-18', endDate: '2026-11-18', typeName: 'Congé payé' }],
    );
    expect(alerts).toContainEqual({
      kind: 'SHIFT_ON_ABSENCE',
      date: '2026-11-18',
      detail: 'Congé payé',
    });
  });
});
