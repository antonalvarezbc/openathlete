import { SPORT_TYPE, WeeklyVolumeDto } from '@openathlete/shared';

export type VolumeMetric = 'duration' | 'distance' | 'elevationGain';

/** Sports with their own bar segment; the rest share one */
const MAX_SPORTS = 4;
// Not 'OTHER': that is a sport of its own
export const OTHER_SPORTS = 'OTHER_SPORTS' as const;

export type VolumeSeries = SPORT_TYPE | typeof OTHER_SPORTS;

export type VolumeRow = { weekStart: number } & Partial<
  Record<VolumeSeries, number>
>;

/**
 * One row per week, one value per sport, in display units: hours,
 * kilometres or metres. The sports with the most volume over the period
 * come first; beyond four, they are summed as "other".
 */
export function weeklyVolumeData(
  weeks: WeeklyVolumeDto[],
  metric: VolumeMetric,
): { rows: VolumeRow[]; series: VolumeSeries[] } {
  const scale =
    metric === 'duration' ? 1 / 3600 : metric === 'distance' ? 1 / 1000 : 1;
  const totals = new Map<SPORT_TYPE, number>();
  for (const week of weeks) {
    for (const sport of week.sports) {
      totals.set(sport.sport, (totals.get(sport.sport) ?? 0) + sport[metric]);
    }
  }
  const ranked = [...totals.entries()]
    .filter(([, total]) => total > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([sport]) => sport);
  const own = new Set(
    ranked.length > MAX_SPORTS ? ranked.slice(0, MAX_SPORTS - 1) : ranked,
  );
  const series: VolumeSeries[] = [
    ...own,
    ...(own.size < ranked.length ? [OTHER_SPORTS as VolumeSeries] : []),
  ];

  const rows = weeks.map((week) => {
    const row: VolumeRow = { weekStart: new Date(week.weekStart).getTime() };
    for (const sport of week.sports) {
      const key = own.has(sport.sport) ? sport.sport : OTHER_SPORTS;
      if (!series.includes(key)) continue;
      row[key] = (row[key] ?? 0) + sport[metric] * scale;
    }
    return row;
  });
  return { rows, series };
}
