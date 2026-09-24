import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { ActivitySegmentType } from '@openathlete/database';
import { ActivityStream } from '@openathlete/shared';

import { calculateSegmentMetrics } from '../../core/helpers/activity-segment';
import { compressActivityStream } from '../../core/helpers/activity-stream';
import { FitParserStrategy } from '../../core/helpers/strategies/fit-parser.strategy';

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
  const { stream } = parsed;
  if (!stream.time?.length || !stream.time.every(Number.isFinite))
    throw new Error('Empty FIT stream');
  // The existing parser omits missing samples. Never align a shortened sensor
  // series against the complete time axis; omit that channel instead.
  let incomplete = false;
  for (const key of Object.keys(stream) as (keyof ActivityStream)[]) {
    if (key !== 'time' && stream[key]?.length !== stream.time.length) {
      delete stream[key];
      incomplete = true;
    }
  }
  const segments = (parsed.segments ?? [])
    .filter((lap) => lap.endTimeSeconds > lap.startTimeSeconds)
    .map((lap, index) => {
      const metrics = calculateSegmentMetrics(
        stream,
        lap.startTimeSeconds,
        lap.endTimeSeconds,
      );
      return {
        segmentType: ActivitySegmentType.LAP,
        name: lap.name ?? 'Lap ' + (index + 1),
        orderIndex: index,
        startTimeSeconds: Math.round(lap.startTimeSeconds),
        endTimeSeconds: Math.round(lap.endTimeSeconds),
        distance: metrics.distance,
        elevationGain: metrics.elevation_gain,
        movingTime: metrics.moving_time,
        averageSpeed: metrics.average_speed,
        maxSpeed: metrics.max_speed,
        averageCadence: metrics.average_cadence,
        averageWatts: metrics.average_watts,
        maxWatts: metrics.max_watts,
        weightedAverageWatts: metrics.weighted_average_watts,
        averageHeartrate: metrics.average_heartrate,
        maxHeartrate: metrics.max_heartrate,
        kilojoules: metrics.kilojoules,
      };
    });
  return { stream: compressActivityStream(stream), segments, incomplete };
}
