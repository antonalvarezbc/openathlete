import { describe, expect, it } from 'vitest';

import { statisticsPeriod } from './statistics-period';

// A Monday: the current calendar week has barely started
const monday = new Date(2026, 9, 5, 9, 30);

describe('statistics periods', () => {
  it('opens on the last seven days, today included', () => {
    const { start, end } = statisticsPeriod('days7', 0, monday);
    expect(start).toEqual(new Date(2026, 8, 29, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 9, 5, 23, 59, 59, 999));
  });

  it('steps back by whole periods', () => {
    expect(statisticsPeriod('days7', -1, monday).end).toEqual(
      new Date(2026, 8, 28, 23, 59, 59, 999),
    );
    expect(statisticsPeriod('week', -1, monday).start).toEqual(
      new Date(2026, 8, 28),
    );
    // From 31 March, one month back is February, not early March
    expect(statisticsPeriod('month', -1, new Date(2026, 2, 31)).start).toEqual(
      new Date(2026, 1, 1),
    );
    expect(statisticsPeriod('year', -1, monday).start).toEqual(
      new Date(2025, 0, 1),
    );
  });
});
