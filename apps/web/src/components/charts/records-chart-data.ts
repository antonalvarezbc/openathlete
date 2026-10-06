import { RECORD_TYPE, Record as RecordType } from '@openathlete/shared';

export type RecordsChartPoint = { distance: number } & {
  [type in RECORD_TYPE]: number | null;
};

/**
 * One point per distance, each type in the unit it is plotted in: speed in
 * m/s, elevation in m/h. A type without a record at a distance is null, so
 * the curve skips it instead of dropping to zero.
 */
export function recordsChartData(records: RecordType[]): RecordsChartPoint[] {
  const byDistance = new Map<number, Partial<Record<RECORD_TYPE, number>>>();
  for (const record of records) {
    const values = byDistance.get(record.distance) ?? {};
    byDistance.set(record.distance, values);
    if (record.type === RECORD_TYPE.SPEED) {
      values[record.type] = record.distance / record.value;
    } else if (
      record.type === RECORD_TYPE.ELEVATION_GAIN ||
      record.type === RECORD_TYPE.ELEVATION_LOSS
    ) {
      const duration = (record.endDuration || 1) - (record.startDuration || 0);
      values[record.type] = record.value / (duration / 3600);
    } else {
      values[record.type as RECORD_TYPE] = record.value;
    }
  }
  return [...byDistance.entries()]
    .sort(([a], [b]) => a - b)
    .map(([distance, values]) => ({
      distance,
      ...(Object.fromEntries(
        Object.values(RECORD_TYPE).map((type) => [type, values[type] ?? null]),
      ) as { [type in RECORD_TYPE]: number | null }),
    }));
}
