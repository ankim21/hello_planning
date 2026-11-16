import { describe, expect, it } from 'vitest';
import { zonedDateTime } from './zoned-time.js';
import { localDate } from './pairing.js';

describe('zonedDateTime', () => {
  it('uses winter time in November (UTC+1)', () => {
    expect(zonedDateTime('2026-11-16', '10:00', 'Europe/Paris')).toEqual(
      new Date('2026-11-16T09:00:00.000Z'),
    );
  });

  it('uses summer time in July (UTC+2)', () => {
    expect(zonedDateTime('2026-07-16', '10:00', 'Europe/Paris')).toEqual(
      new Date('2026-07-16T08:00:00.000Z'),
    );
  });
});

describe('localDate', () => {
  it('gives the date at the site, not in UTC', () => {
    // 23:30 UTC on the 16th is already 00:30 on the 17th in Paris.
    expect(localDate(new Date('2026-11-16T23:30:00.000Z'), 'Europe/Paris')).toBe(
      '2026-11-17',
    );
  });
});

import { plannedMinutes, shiftInstants } from './zoned-time.js';

describe('shiftInstants', () => {
  it('ends the next day when the shift crosses midnight', () => {
    const { startsAt, endsAt } = shiftInstants('2026-11-20', '16:30', '00:30', 'Europe/Paris');
    expect(startsAt).toEqual(new Date('2026-11-20T15:30:00.000Z'));
    expect(endsAt).toEqual(new Date('2026-11-20T23:30:00.000Z'));
    // 8 hours minus a 20-minute break = 7h40, as on the planning card.
    expect(plannedMinutes(startsAt, endsAt, 20)).toBe(460);
  });
});
