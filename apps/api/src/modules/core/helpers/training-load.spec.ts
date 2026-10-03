import {
  addUtcDays,
  calculateTrimpFromAverage,
  calculateTrimpFromStream,
  getUtcWeekStart,
  startOfUtcDay,
  toUtcDateKey,
} from './training-load';

const HR_MAX = 190;
const HR_REST = 50;

describe('UTC date helpers', () => {
  it('keys a date by its UTC calendar day', () => {
    expect(toUtcDateKey(new Date('2026-05-04T23:30:00.000Z'))).toBe(
      '2026-05-04',
    );
  });

  it('truncates to UTC midnight', () => {
    expect(
      startOfUtcDay(new Date('2026-05-04T23:30:00.000Z')).toISOString(),
    ).toBe('2026-05-04T00:00:00.000Z');
  });

  it('adds whole UTC days across a DST change', () => {
    // Europe switches to summer time on 2026-03-29
    expect(
      addUtcDays(new Date('2026-03-28T00:00:00.000Z'), 2).toISOString(),
    ).toBe('2026-03-30T00:00:00.000Z');
  });

  it.each([
    ['2026-05-04T00:00:00.000Z', '2026-05-04T00:00:00.000Z'], // Monday
    ['2026-05-06T12:00:00.000Z', '2026-05-04T00:00:00.000Z'], // Wednesday
    ['2026-05-10T23:59:59.999Z', '2026-05-04T00:00:00.000Z'], // Sunday
    ['2026-05-11T00:00:00.000Z', '2026-05-11T00:00:00.000Z'], // next Monday
  ])('returns the UTC Monday of the week of %s', (input, expected) => {
    expect(getUtcWeekStart(new Date(input)).toISOString()).toBe(expected);
  });
});

describe('calculateTrimpFromAverage', () => {
  it('applies the male Banister formula', () => {
    const result = calculateTrimpFromAverage(150, 3600, HR_MAX, HR_REST);
    expect(result.value).toBeCloseTo(108.0954, 3);
    expect(result).toMatchObject({ avgHr: 150, duration: 3600 });
  });

  it('applies the female coefficients', () => {
    const result = calculateTrimpFromAverage(
      150,
      3600,
      HR_MAX,
      HR_REST,
      'female',
    );
    expect(result.value).toBeCloseTo(121.4991, 3);
  });

  it('returns 0 when average HR is at or below resting HR', () => {
    expect(calculateTrimpFromAverage(50, 3600, HR_MAX, HR_REST).value).toBe(0);
  });
});

describe('calculateTrimpFromStream', () => {
  it('matches the average-based TRIMP for a constant heart rate', () => {
    const time = Array.from({ length: 3601 }, (_, i) => i);
    const heartrate = time.map(() => 150);

    const result = calculateTrimpFromStream(
      { time, heartrate },
      HR_MAX,
      HR_REST,
    );

    expect(result.value).toBeCloseTo(108.0954, 3);
    expect(result.avgHr).toBe(150);
    expect(result.duration).toBe(3600);
  });

  it('ignores samples at or below resting HR', () => {
    const result = calculateTrimpFromStream(
      { time: [0, 60, 120], heartrate: [40, 40, 40] },
      HR_MAX,
      HR_REST,
    );
    expect(result).toMatchObject({ value: 0, avgHr: 0 });
  });

  it('throws without heart rate data', () => {
    expect(() =>
      calculateTrimpFromStream({ time: [0, 1] }, HR_MAX, HR_REST),
    ).toThrow('Heart rate or time data not available');
  });
});
