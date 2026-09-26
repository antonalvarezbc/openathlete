import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { calculateSegmentMetrics } from '../../core/helpers/activity-segment';
import { buildFitActivityDetails } from '../../core/helpers/fit-activity-details';
import { FitParserStrategy } from '../../core/helpers/strategies/fit-parser.strategy';

const positiveOrZero = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;

export function hasActivityStream(stream: unknown): boolean {
  if (!stream || typeof stream !== 'object') return false;
  const time = (stream as { time?: unknown }).time;
  return Array.isArray(time) && time.length > 0;
}

export async function readManualFit(
  directory: string,
  profile: string,
  id: string,
) {
  if (!/^\d+$/.test(profile) || !/^\d+$/.test(id))
    throw new Error('Invalid FIT identity');
  const file = join(directory, '.private', 'fits', profile, id + '.fit');
  if ((await stat(file)).size > 20 * 1024 * 1024)
    throw new Error('FIT too large');
  const buffer = await readFile(file);
  const parsed = await new FitParserStrategy().parse(
    Uint8Array.from(buffer).buffer,
  );
  if (!parsed.stream.time?.length) throw new Error('Empty FIT stream');
  const details = buildFitActivityDetails(parsed);
  // Never attribute a multisport leg's summary to the whole activity. Compute
  // fallbacks only after incomplete sensor channels have been removed.
  const session =
    !parsed.fit?.decodeErrors &&
    parsed.fit?.sessions.length === 1 &&
    parsed.fit.sessions[0].sport !== 18
      ? parsed.fit.sessions[0]
      : null;
  const metrics = session
    ? calculateSegmentMetrics(
        parsed.stream,
        0,
        parsed.stream.time[parsed.stream.time.length - 1] + 1,
      )
    : {};
  const totalWork = positiveOrZero(session?.totalWork);
  return {
    ...details,
    summary: {
      averageCadence:
        positiveOrZero(session?.avgCadence) ??
        positiveOrZero(metrics.average_cadence),
      averageWatts:
        positiveOrZero(session?.avgPower) ??
        positiveOrZero(metrics.average_watts),
      maxWatts:
        positiveOrZero(session?.maxPower) ?? positiveOrZero(metrics.max_watts),
      // FIT normalized power is not the same as a time-weighted stream mean.
      weightedAverageWatts: positiveOrZero(session?.normalizedPower),
      averageHeartrate:
        positiveOrZero(session?.avgHeartRate) ??
        positiveOrZero(metrics.average_heartrate),
      maxHeartrate:
        positiveOrZero(session?.maxHeartRate) ??
        positiveOrZero(metrics.max_heartrate),
      kilojoules: totalWork === null ? null : totalWork / 1000,
    },
  };
}
