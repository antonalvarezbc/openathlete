import { describe, expect, it } from 'vitest';

import { getUtcWeekKey, getWeekKey } from './week';

// Run with TZ set to a negative and a positive offset in CI to cover #24:
// a UTC midnight is still the previous local day in America/*.
describe('week keys', () => {
  const mondayKey = '2026-05-04T00:00:00.000Z';

  it('keys a local calendar day by its Monday', () => {
    expect(getWeekKey(new Date(2026, 4, 4))).toBe(mondayKey); // Monday
    expect(getWeekKey(new Date(2026, 4, 10, 23, 59))).toBe(mondayKey); // Sunday
  });

  it('keys an API week start to the same week in any timezone', () => {
    expect(getUtcWeekKey(mondayKey)).toBe(mondayKey);
    expect(getUtcWeekKey(new Date(mondayKey))).toBe(mondayKey);
  });

  it('matches the key of the displayed local week', () => {
    const displayedMonday = new Date(2026, 4, 4);
    expect(getUtcWeekKey(mondayKey)).toBe(getWeekKey(displayedMonday));
  });
});
