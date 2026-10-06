import { describe, expect, it } from 'vitest';

import { RECORD_TYPE, Record } from '@openathlete/shared';

import { recordsChartData } from './records-chart-data';

const record = (type: RECORD_TYPE, distance: number, value: number) =>
  ({ type, distance, value, startDuration: 0, endDuration: 600 }) as Record;

describe('records chart data', () => {
  it('leaves a gap where a type has no record instead of plotting zero', () => {
    const data = recordsChartData([
      record(RECORD_TYPE.SPEED, 1000, 250),
      record(RECORD_TYPE.HEARTRATE, 1000, 170),
      record(RECORD_TYPE.HEARTRATE, 100000, 140),
    ]);
    expect(data.map((point) => point.distance)).toEqual([1000, 100000]);
    expect(data[0].SPEED).toBe(4);
    expect(data[1].SPEED).toBeNull();
    expect(data[1].HEARTRATE).toBe(140);
  });

  it('plots elevation as metres per hour', () => {
    const [point] = recordsChartData([
      record(RECORD_TYPE.ELEVATION_GAIN, 1000, 100),
    ]);
    expect(point.ELEVATION_GAIN).toBe(600);
  });
});
