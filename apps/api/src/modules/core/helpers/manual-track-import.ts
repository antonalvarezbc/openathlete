import { calculateDistance } from './activity-parser.utils';

/**
 * Rules shared by the formats that record a track point by point (GPX, TCX),
 * where the file gives no ready-made series and summaries are computed.
 */

/** Same limit as manual FIT files. */
export const MAX_MANUAL_TRACK_POINTS = 100000;
/** Below this speed (m/s) a stretch counts as stopped, not moving. */
const MOVING_SPEED = 0.3;
/** Climbs smaller than this (m) are treated as altitude noise. */
const ELEVATION_THRESHOLD = 2;
/** Max speed is measured over at least this many seconds. */
const MAX_SPEED_WINDOW = 10;
/** Faster than this (m/s, 180 km/h) between two points is a GPS glitch. */
const MAX_PLAUSIBLE_SPEED = 50;
/** A sensor present on this share of points has its gaps filled. */
const MIN_CHANNEL_COVERAGE = 0.9;

/**
 * A sensor value for every point, or nothing. Short dropouts are filled with
 * the last value (the first value for leading gaps); a sensor missing on more
 * than a tenth of the points is left out instead of being misaligned.
 */
export function alignChannel(values: (number | null)[]) {
  const present = values.filter((value) => value !== null).length;
  if (!present) return { values: undefined, incomplete: false };
  if (present / values.length < MIN_CHANNEL_COVERAGE)
    return { values: undefined, incomplete: true };
  let last = values.find((value) => value !== null)!;
  return {
    values: values.map((value) => (value === null ? last : (last = value))),
    incomplete: false,
  };
}

/** Climbing with a small hysteresis, so GPS altitude noise is not counted. */
export function elevationGain(altitude: number[]) {
  let gain = 0;
  let reference = altitude[0];
  for (const value of altitude) {
    if (value < reference) reference = value;
    else if (value - reference >= ELEVATION_THRESHOLD) {
      gain += value - reference;
      reference = value;
    }
  }
  return Math.round(gain);
}

/** Highest speed held for at least MAX_SPEED_WINDOW seconds. */
export function maxSpeed(time: number[], distance: number[]) {
  let best = 0;
  let start = 0;
  for (let end = 1; end < time.length; end++) {
    while (start < end && time[end] - time[start + 1] >= MAX_SPEED_WINDOW)
      start++;
    const span = time[end] - time[start];
    if (span >= MAX_SPEED_WINDOW)
      best = Math.max(best, (distance[end] - distance[start]) / span);
  }
  return best;
}

/** A position as [lat, lon], or [] when it is missing or out of range. */
export function trackPosition(lat: number | null, lon: number | null) {
  return lat !== null &&
    lon !== null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
    ? [lat, lon]
    : [];
}

/**
 * Cumulative distance between consecutive known positions. A position
 * implying an impossible speed is a glitch: it loses its GPS (`coordinates`
 * is updated in place), so it neither adds distance nor draws a spike on the
 * map.
 */
export function trackDistance(coordinates: number[][], time: number[]) {
  let total = 0;
  let previous: { at: number; point: number[] } | null = null;
  const distance = coordinates.map((point, index) => {
    if (point.length !== 2) return total;
    if (previous) {
      const meters = calculateDistance(
        previous.point[0],
        previous.point[1],
        point[0],
        point[1],
      );
      const seconds = time[index] - previous.at;
      if (meters > MAX_PLAUSIBLE_SPEED * Math.max(seconds, 1)) {
        coordinates[index] = [];
        return total;
      }
      total += meters;
    }
    previous = { at: time[index], point };
    return total;
  });
  return { distance, total };
}

/**
 * Moving time: stretches faster than a slow walk, or all of it without a
 * distance to tell. Falls back to the elapsed time when nothing moved.
 */
export function trackMovingTime(
  time: number[],
  distance: number[] | undefined,
  elapsed: number,
) {
  let moving = 0;
  for (let i = 1; i < time.length; i++) {
    const seconds = time[i] - time[i - 1];
    if (!distance || (distance[i] - distance[i - 1]) / seconds >= MOVING_SPEED)
      moving += seconds;
  }
  return Math.round(moving) || Math.round(elapsed);
}
