import { Record as PrismaRecord, RecordType } from '@openathlete/database';
import { ActivityStream, isValidGpsPoint } from '@openathlete/shared';

// Target distances for all record types (in meters)
const TARGET_DISTANCES = [
  400, // 400m
  800, // 800m
  1000, // 1000m
  1500, // 1500m
  3000, // 3000m
  5000, // 5000m
  10000, // 10k
  15000, // 15k
  20000, // 20k
  21097.5, // Semi
  42195, // Marathon
  50000, // 50km
  100000, // 100km
];

// Longer streams are sampled down to this many points before the search
const MAX_POINTS_WITHOUT_SAMPLING = 5000;

/**
 * Sample arrays to reduce size while preserving start and end points
 * Uses linear interpolation to maintain accuracy
 */
function sampleArray<T>(arr: T[], targetSize: number): T[] {
  if (arr.length <= targetSize) {
    return arr;
  }

  const sampled: T[] = [arr[0]]; // Always keep first point
  const step = (arr.length - 1) / (targetSize - 1);

  for (let i = 1; i < targetSize - 1; i++) {
    const index = i * step;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const fraction = index - lower;

    if (lower === upper || fraction === 0) {
      sampled.push(arr[lower]);
    } else if (typeof arr[0] === 'number') {
      // Interpolate numbers
      const lowerVal = arr[lower] as number;
      const upperVal = arr[upper] as number;
      sampled.push((lowerVal + (upperVal - lowerVal) * fraction) as T);
    } else if (Array.isArray(arr[0])) {
      // Interpolate arrays (like latlng)
      const lowerVal = arr[lower] as number[];
      const upperVal = arr[upper] as number[];
      const interpolated = lowerVal.map(
        (val, idx) => val + (upperVal[idx] - val) * fraction,
      );
      sampled.push(interpolated as T);
    } else {
      sampled.push(arr[lower]);
    }
  }

  sampled.push(arr[arr.length - 1]); // Always keep last point
  return sampled;
}

/**
 * Calculate cumulative distances from latlng stream
 * This is expensive, so we compute it once and reuse.
 * No distance is counted across a GPS gap: the distance stays flat, which
 * can only make a segment slower, never invent a faster one.
 */
function calculateCumulativeDistances(latlngStream: number[][]): number[] {
  const cumulativeDistances: number[] = [0];
  for (let i = 1; i < latlngStream.length; i++) {
    const previous = latlngStream[i - 1];
    const current = latlngStream[i];
    const distance =
      isValidGpsPoint(previous) && isValidGpsPoint(current)
        ? calculateHaversineDistance(
            previous[0],
            previous[1],
            current[0],
            current[1],
          )
        : 0;
    cumulativeDistances.push(cumulativeDistances[i - 1] + distance);
  }
  return cumulativeDistances;
}

type ComputedRecord = Pick<
  PrismaRecord,
  'distance' | 'value' | 'startDuration' | 'endDuration' | 'type'
>;

/**
 * A stretch of exactly targetDistance starting at a recorded point. It ends
 * between `right - 1` and `right`, `fraction` of the way: positions are
 * interpolated there, so the result no longer depends on a point happening
 * to fall at the target distance, which sparse recordings rarely provide.
 */
type Stretch = { left: number; right: number; fraction: number };

function* stretchesOf(
  cumulativeDistances: number[],
  targetDistance: number,
): Generator<Stretch> {
  let right = 0;
  for (let left = 0; left < cumulativeDistances.length; left++) {
    while (
      right < cumulativeDistances.length &&
      cumulativeDistances[right] - cumulativeDistances[left] < targetDistance
    ) {
      right++;
    }
    if (right === cumulativeDistances.length) return;
    // right > left, since a stretch of zero length never reaches the target
    const before = cumulativeDistances[right - 1] - cumulativeDistances[left];
    const step = cumulativeDistances[right] - cumulativeDistances[right - 1];
    yield { left, right, fraction: (targetDistance - before) / step };
  }
}

/** A cumulative series read at the end of a stretch. */
function at(series: number[], { right, fraction }: Stretch): number {
  return series[right - 1] + (series[right] - series[right - 1]) * fraction;
}

/**
 * Best stretch for each target distance, `score` returning the value to
 * keep (higher is better), or null when the stretch has no data.
 */
function bestStretches(
  type: RecordType,
  timeStream: number[],
  cumulativeDistances: number[],
  score: (stretch: Stretch) => { value: number; rank: number } | null,
): ComputedRecord[] {
  const records: ComputedRecord[] = [];
  for (const targetDistance of TARGET_DISTANCES) {
    let best: { value: number; rank: number; stretch: Stretch } | null = null;
    for (const stretch of stretchesOf(cumulativeDistances, targetDistance)) {
      const result = score(stretch);
      if (result && (!best || result.rank > best.rank)) {
        best = { ...result, stretch };
      }
    }
    if (!best) continue;
    records.push({
      type,
      distance: targetDistance,
      value: best.value,
      startDuration: Math.round(timeStream[best.stretch.left]),
      endDuration: Math.round(at(timeStream, best.stretch)),
    });
  }
  return records;
}

/**
 * Fastest time over each distance. Pauses stay in: elapsed time only makes
 * a stretch slower, so the fastest one avoids them on its own.
 */
function computeSpeedRecords(
  timeStream: number[],
  cumulativeDistances: number[],
): ComputedRecord[] {
  return bestStretches('SPEED', timeStream, cumulativeDistances, (stretch) => {
    const time = at(timeStream, stretch) - timeStream[stretch.left];
    return time > 0 ? { value: time, rank: -time } : null;
  });
}

/** Best average of a sampled value (power, heart rate, cadence). */
function computeAverageRecords(
  type: RecordType,
  timeStream: number[],
  cumulativeDistances: number[],
  valueStream: number[],
): ComputedRecord[] {
  const length = Math.min(valueStream.length, cumulativeDistances.length);
  const sums = [0];
  const counts = [0];
  for (let i = 0; i < length; i++) {
    const valid = Number.isFinite(valueStream[i]);
    sums.push(sums[i] + (valid ? valueStream[i] : 0));
    counts.push(counts[i] + (valid ? 1 : 0));
  }
  return bestStretches(
    type,
    timeStream,
    cumulativeDistances.slice(0, length),
    ({ left, right }) => {
      const count = counts[right + 1] - counts[left];
      if (count === 0) return null;
      const average = (sums[right + 1] - sums[left]) / count;
      return { value: average, rank: average };
    },
  );
}

/** Most climbing or descending over each distance. */
function computeElevationRecords(
  type: 'ELEVATION_GAIN' | 'ELEVATION_LOSS',
  timeStream: number[],
  cumulativeDistances: number[],
  altitude: number[],
): ComputedRecord[] {
  const length = Math.min(altitude.length, cumulativeDistances.length);
  const cumulative = [0];
  for (let i = 1; i < length; i++) {
    const diff = altitude[i] - altitude[i - 1];
    const change = Number.isFinite(diff)
      ? type === 'ELEVATION_GAIN'
        ? Math.max(diff, 0)
        : Math.max(-diff, 0)
      : 0;
    cumulative.push(cumulative[i - 1] + change);
  }
  return bestStretches(
    type,
    timeStream,
    cumulativeDistances.slice(0, length),
    (stretch) => {
      const change = at(cumulative, stretch) - cumulative[stretch.left];
      return { value: change, rank: change };
    },
  );
}

/**
 * Main function to compute all records from an activity stream
 */
export const computeRecords = (stream: ActivityStream): ComputedRecord[] => {
  const { time, latlng, altitude, heartrate, cadence, watts } = stream;

  // Early exit if no essential data
  if (!time || !latlng || time.length === 0 || latlng.length === 0) {
    return [];
  }

  // GPS-derived records require a route aligned with time
  if (latlng.length !== time.length || !latlng.some(isValidGpsPoint)) {
    return [];
  }

  // Computed before sampling: interpolating across a GPS gap would invent
  // positions
  let cumulativeDistances = calculateCumulativeDistances(latlng);

  // Sample streams if they're too large to reduce memory usage and computation time
  let timeStream = time;
  let altitudeStream = altitude;
  let heartrateStream = heartrate;
  let cadenceStream = cadence;
  let wattsStream = watts;

  if (timeStream.length > MAX_POINTS_WITHOUT_SAMPLING) {
    const targetSize = MAX_POINTS_WITHOUT_SAMPLING;
    timeStream = sampleArray(timeStream, targetSize);
    cumulativeDistances = sampleArray(cumulativeDistances, targetSize);
    if (altitudeStream)
      altitudeStream = sampleArray(altitudeStream, targetSize);
    if (heartrateStream) {
      heartrateStream = sampleArray(heartrateStream, targetSize);
    }
    if (cadenceStream) cadenceStream = sampleArray(cadenceStream, targetSize);
    if (wattsStream) wattsStream = sampleArray(wattsStream, targetSize);
  }

  const averages = (
    type: RecordType,
    values: number[] | undefined,
  ): ComputedRecord[] =>
    values?.length
      ? computeAverageRecords(type, timeStream, cumulativeDistances, values)
      : [];
  const elevation = (type: 'ELEVATION_GAIN' | 'ELEVATION_LOSS') =>
    altitudeStream?.length
      ? computeElevationRecords(
          type,
          timeStream,
          cumulativeDistances,
          altitudeStream,
        )
      : [];

  return [
    ...computeSpeedRecords(timeStream, cumulativeDistances),
    ...averages('POWER', wattsStream),
    ...averages('HEARTRATE', heartrateStream),
    ...averages('CADENCE', cadenceStream),
    ...elevation('ELEVATION_GAIN'),
    ...elevation('ELEVATION_LOSS'),
  ];
};

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
