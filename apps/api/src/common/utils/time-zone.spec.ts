import { addDaysToDateKey, startOfZonedDay, zonedClock } from './time-zone';

describe('time zones', () => {
  it('reads the local date and hour', () => {
    const instant = new Date('2026-10-09T17:30:00Z');
    expect(zonedClock(instant, 'Europe/Paris')).toEqual({
      date: '2026-10-09',
      hour: 19,
    });
    expect(zonedClock(instant, 'Asia/Tokyo')).toEqual({
      date: '2026-10-10',
      hour: 2,
    });
    expect(zonedClock(instant, 'America/New_York')).toEqual({
      date: '2026-10-09',
      hour: 13,
    });
    expect(zonedClock(instant, 'UTC')).toEqual({
      date: '2026-10-09',
      hour: 17,
    });
  });

  it('finds when a local day starts', () => {
    expect(startOfZonedDay('2026-10-10', 'Europe/Paris').toISOString()).toBe(
      '2026-10-09T22:00:00.000Z',
    );
    expect(startOfZonedDay('2026-10-10', 'Asia/Tokyo').toISOString()).toBe(
      '2026-10-09T15:00:00.000Z',
    );
    expect(
      startOfZonedDay('2026-10-10', 'America/New_York').toISOString(),
    ).toBe('2026-10-10T04:00:00.000Z');
    expect(startOfZonedDay('2026-10-10', 'UTC').toISOString()).toBe(
      '2026-10-10T00:00:00.000Z',
    );
  });

  it('follows daylight saving changes', () => {
    // Paris moves to winter time on 25 October 2026 at 3:00
    expect(startOfZonedDay('2026-10-25', 'Europe/Paris').toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    );
    expect(startOfZonedDay('2026-10-26', 'Europe/Paris').toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
    // New York moves to summer time on 8 March 2026 at 2:00
    expect(
      startOfZonedDay('2026-03-08', 'America/New_York').toISOString(),
    ).toBe('2026-03-08T05:00:00.000Z');
    expect(
      startOfZonedDay('2026-03-09', 'America/New_York').toISOString(),
    ).toBe('2026-03-09T04:00:00.000Z');
  });

  it('adds days to a date across months and years', () => {
    expect(addDaysToDateKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDateKey('2026-12-31', 2)).toBe('2027-01-02');
  });
});
