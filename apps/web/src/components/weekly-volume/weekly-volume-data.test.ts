import { describe, expect, it } from 'vitest';

import { SPORT_TYPE, WeeklyVolumeDto } from '@openathlete/shared';

import { OTHER_SPORTS, weeklyVolumeData } from './weekly-volume-data';

const sport = (name: SPORT_TYPE, duration: number) => ({
  sport: name,
  duration,
  distance: duration * 3,
  elevationGain: 0,
  count: 1,
});

describe('weekly volume', () => {
  it('converts each week into display units, empty weeks included', () => {
    const weeks: WeeklyVolumeDto[] = [
      { weekStart: new Date('2026-09-21'), sports: [] },
      {
        weekStart: new Date('2026-09-28'),
        sports: [sport(SPORT_TYPE.RUNNING, 7200)],
      },
    ];
    const { rows, series } = weeklyVolumeData(weeks, 'duration');
    expect(series).toEqual([SPORT_TYPE.RUNNING]);
    expect(rows).toEqual([
      { weekStart: new Date('2026-09-21').getTime() },
      { weekStart: new Date('2026-09-28').getTime(), RUNNING: 2 },
    ]);
    expect(weeklyVolumeData(weeks, 'distance').rows[1].RUNNING).toBe(21.6);
  });

  it('keeps the biggest sports and sums the rest', () => {
    const weeks: WeeklyVolumeDto[] = [
      {
        weekStart: new Date('2026-09-28'),
        sports: [
          sport(SPORT_TYPE.RUNNING, 5000),
          sport(SPORT_TYPE.CYCLING, 4000),
          sport(SPORT_TYPE.SWIMMING, 3000),
          sport(SPORT_TYPE.HIKING, 2000),
          sport(SPORT_TYPE.YOGA, 1000),
        ],
      },
    ];
    const { rows, series } = weeklyVolumeData(weeks, 'duration');
    expect(series).toEqual([
      SPORT_TYPE.RUNNING,
      SPORT_TYPE.CYCLING,
      SPORT_TYPE.SWIMMING,
      OTHER_SPORTS,
    ]);
    expect(rows[0][OTHER_SPORTS]).toBeCloseTo(3000 / 3600);
  });

  it('leaves out sports without any of the chosen volume', () => {
    const weeks: WeeklyVolumeDto[] = [
      {
        weekStart: new Date('2026-09-28'),
        sports: [sport(SPORT_TYPE.RUNNING, 3600), sport(SPORT_TYPE.YOGA, 3600)],
      },
    ];
    weeks[0].sports[1].distance = 0;
    expect(weeklyVolumeData(weeks, 'distance').series).toEqual([
      SPORT_TYPE.RUNNING,
    ]);
  });
});
