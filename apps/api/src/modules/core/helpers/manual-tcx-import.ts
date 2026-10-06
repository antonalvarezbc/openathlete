import { DOMParser } from 'xmldom-qsa';

import { BadRequestException } from '@nestjs/common';

import {
  ActivityImportWarning,
  ActivityStream,
  SPORT_TYPE,
} from '@openathlete/shared';

import { FitFileSegment } from './activity-parser.interface';
import { toNumber, toTimestamp } from './activity-parser.utils';
import { calculateSegmentMetrics } from './activity-segment';
import { buildFitActivityDetails } from './fit-activity-details';
import {
  MAX_MANUAL_TRACK_POINTS,
  alignChannel,
  elevationGain,
  maxSpeed,
  trackDistance,
  trackMovingTime,
  trackPosition,
} from './manual-track-import';

/** Same limits as manual FIT files. */
export const MAX_MANUAL_TCX_LAPS = 1000;

// TCX only knows these three; anything else needs the athlete's choice.
const TCX_SPORTS: Record<string, SPORT_TYPE> = {
  running: SPORT_TYPE.RUNNING,
  biking: SPORT_TYPE.CYCLING,
};

/** The sport a TCX activity declares, if it is one we recognize. */
export function tcxSport(sport: unknown): SPORT_TYPE | undefined {
  return typeof sport === 'string'
    ? TCX_SPORTS[sport.trim().toLowerCase()]
    : undefined;
}

// Elements are matched by local name: TCX writers use default namespaces for
// the main schema and any prefix (ns3:, ax:...) for the extensions.
const localName = (node: Node) =>
  (node as Element).localName ?? node.nodeName.split(':').pop()!;

function childElements(parent: Element, name: string): Element[] {
  const found: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling)
    if (node.nodeType === 1 && localName(node) === name)
      found.push(node as Element);
  return found;
}

/** The first element along a path of child names. */
function childAt(parent: Element, ...path: string[]): Element | undefined {
  let current: Element | undefined = parent;
  for (const name of path) current = current && childElements(current, name)[0];
  return current;
}

const numberAt = (parent: Element, ...path: string[]) =>
  toNumber(childAt(parent, ...path)?.textContent?.trim());

/**
 * A value inside the element's Extensions (Garmin's TPX for track points, LX
 * for laps), by local name whatever its prefix.
 */
function extensionValue(parent: Element, name: string): number | null {
  const extensions = childElements(parent, 'Extensions')[0];
  if (!extensions) return null;
  const elements = extensions.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++)
    if (localName(elements[i]) === name)
      return toNumber(elements[i].textContent?.trim());
  return null;
}

const nonNegative = (value: number | null) =>
  value !== null && Number.isFinite(value) && value >= 0 ? value : null;
const positive = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0 ? value : null;

/** A lap value averaged over the laps' timer time, when every lap has it. */
function lapAverage(
  laps: { seconds: number | null }[],
  value: (index: number) => number | null,
) {
  let total = 0;
  let seconds = 0;
  for (const [index, lap] of laps.entries()) {
    const v = value(index);
    if (v === null || lap.seconds === null) return null;
    total += v * lap.seconds;
    seconds += lap.seconds;
  }
  return seconds > 0 ? total / seconds : null;
}

/** The highest lap value, when some lap has it. */
function lapMax(values: (number | null)[]) {
  const present = values.filter((value) => value !== null);
  return present.length ? Math.max(...present) : null;
}

function parseDocument(buffer: Buffer) {
  let errors = 0;
  try {
    const doc = new DOMParser({
      errorHandler: {
        warning: () => undefined,
        error: () => (errors += 1),
        fatalError: (message: string) => {
          throw new Error(message);
        },
      },
    }).parseFromString(buffer.toString('utf-8'), 'text/xml');
    const root = doc?.documentElement;
    if (!errors && root && localName(root) === 'TrainingCenterDatabase')
      return root;
  } catch {
    // Reported below as an invalid file
  }
  throw new BadRequestException('TCX_INVALID');
}

/**
 * Validates a recorded TCX activity and prepares it like a manual FIT file.
 * The laps give the timer time, distance and heart rate the device measured;
 * the track points give the series. What the laps lack is computed from the
 * track as for GPX. `sport` overrides the sport the file declares.
 */
export function prepareManualTcx(buffer: Buffer, sport?: SPORT_TYPE) {
  const root = parseDocument(buffer);
  const activities = childElements(root, 'Activities')[0];
  if (!activities) {
    // Courses and workouts are plans, not recorded activities.
    const planned =
      childElements(root, 'Courses').length ||
      childElements(root, 'Workouts').length;
    throw new BadRequestException(planned ? 'TCX_NO_TIME' : 'TCX_INVALID');
  }
  const activityList = childElements(activities, 'Activity');
  if (
    activityList.length > 1 ||
    childElements(activities, 'MultiSportSession').length
  )
    throw new BadRequestException('TCX_MULTISPORT_UNSUPPORTED');
  const activity = activityList[0];
  if (!activity) throw new BadRequestException('TCX_INVALID');

  const lapElements = childElements(activity, 'Lap');
  if (lapElements.length > MAX_MANUAL_TCX_LAPS)
    throw new BadRequestException('TCX_LIMIT');
  const trackpoints = lapElements.flatMap((lap) =>
    childElements(lap, 'Track').flatMap((track) =>
      childElements(track, 'Trackpoint'),
    ),
  );
  if (trackpoints.length > MAX_MANUAL_TRACK_POINTS)
    throw new BadRequestException('TCX_LIMIT');

  // Timed points in order; a point going back in time is a recording glitch.
  const points: { at: number; element: Element }[] = [];
  for (const element of trackpoints) {
    const at = toTimestamp(childAt(element, 'Time')?.textContent?.trim());
    if (at === null) continue;
    if (points.length && at < points[points.length - 1].at) continue;
    points.push({ at, element });
  }
  const laps = lapElements.map((lap) => ({
    start: toTimestamp(lap.getAttribute('StartTime')),
    seconds: positive(numberAt(lap, 'TotalTimeSeconds')),
    distance: nonNegative(numberAt(lap, 'DistanceMeters')),
    maxSpeed: nonNegative(numberAt(lap, 'MaximumSpeed')),
    averageHeartrate: positive(numberAt(lap, 'AverageHeartRateBpm', 'Value')),
    maxHeartrate: positive(numberAt(lap, 'MaximumHeartRateBpm', 'Value')),
    cadence: nonNegative(numberAt(lap, 'Cadence')),
    averageWatts: nonNegative(extensionValue(lap, 'AvgWatts')),
    maxWatts: nonNegative(extensionValue(lap, 'MaxWatts')),
  }));
  const timedLaps = laps.filter(
    (lap): lap is typeof lap & { start: number } => lap.start !== null,
  );

  // The activity spans its first lap or point to its last one.
  const hasStream = points.length >= 2;
  const starts = [
    ...(hasStream ? [points[0].at] : []),
    ...timedLaps.map((lap) => lap.start),
  ];
  const ends = [
    ...(hasStream ? [points[points.length - 1].at] : []),
    ...timedLaps.map((lap) => lap.start + (lap.seconds ?? 0) * 1000),
  ];
  if (!starts.length) throw new BadRequestException('TCX_NO_TIME');
  const origin = Math.min(...starts);
  const end = Math.max(...ends);
  const elapsed = (end - origin) / 1000;
  if (elapsed <= 0) throw new BadRequestException('TCX_NO_TIME');
  if (elapsed > 7 * 86400 || end > Date.now() + 5 * 60000)
    throw new BadRequestException('TCX_INVALID');
  const startDate = new Date(origin);

  const time = hasStream ? points.map(({ at }) => (at - origin) / 1000) : [];
  const coordinates = hasStream
    ? points.map(({ element }) =>
        trackPosition(
          numberAt(element, 'Position', 'LatitudeDegrees'),
          numberAt(element, 'Position', 'LongitudeDegrees'),
        ),
      )
    : [];
  const gps = trackDistance(coordinates, time);
  const hasGps = coordinates.some((point) => point.length === 2);
  const sensor = (read: (element: Element) => number | null) =>
    alignChannel(
      hasStream ? points.map(({ element }) => nonNegative(read(element))) : [],
    );
  const channels = {
    // Below sea level is a valid altitude
    altitude: alignChannel(
      hasStream
        ? points.map(({ element }) => numberAt(element, 'AltitudeMeters'))
        : [],
    ),
    heartrate: sensor((element) => numberAt(element, 'HeartRateBpm', 'Value')),
    // Bike cadence is a Trackpoint value; running cadence is in TPX.
    cadence: sensor(
      (element) =>
        numberAt(element, 'Cadence') ?? extensionValue(element, 'RunCadence'),
    ),
    watts: sensor((element) => extensionValue(element, 'Watts')),
  };

  // Distance: the device's own (GPS or foot pod), else between positions,
  // else from the speed it recorded.
  const recorded = sensor((element) => numberAt(element, 'DistanceMeters'));
  const speed = sensor((element) => extensionValue(element, 'Speed'));
  let distance: number[] | undefined;
  if (
    recorded.values &&
    recorded.values.every((value, i, all) => i === 0 || value >= all[i - 1])
  )
    distance = recorded.values;
  else if (hasGps) distance = gps.distance;
  else if (speed.values) {
    let total = 0;
    distance = speed.values.map((value, i) =>
      i === 0 ? 0 : (total += value * (time[i] - time[i - 1])),
    );
  }

  const stream: ActivityStream = hasStream ? { time } : {};
  if (hasGps) stream.latlng = coordinates;
  if (distance) stream.distance = distance;
  for (const [key, channel] of Object.entries(channels))
    if (channel.values) stream[key as keyof typeof channels] = channel.values;

  // Laps end where the next one starts, the last one with the activity.
  const segments: FitFileSegment[] = [];
  const segmentLaps: typeof timedLaps = [];
  for (const [index, lap] of timedLaps.entries()) {
    const next = timedLaps[index + 1];
    const startTimeSeconds = (lap.start - origin) / 1000;
    const endTimeSeconds = next ? (next.start - origin) / 1000 : elapsed;
    if (endTimeSeconds <= startTimeSeconds) continue;
    segments.push({
      startTimeSeconds,
      endTimeSeconds,
      orderIndex: segments.length,
    });
    segmentLaps.push(lap);
  }
  let details: ReturnType<typeof buildFitActivityDetails>;
  try {
    details = buildFitActivityDetails({ stream, segments });
  } catch {
    throw new BadRequestException('TCX_INVALID');
  }
  // What the series cannot tell (summary-only files), the lap does.
  details.segments = details.segments.map((segment, index) => {
    const lap = segmentLaps[index];
    return {
      ...segment,
      distance: segment.distance ?? lap.distance ?? undefined,
      maxSpeed: segment.maxSpeed ?? lap.maxSpeed ?? undefined,
      averageHeartrate:
        segment.averageHeartrate ?? lap.averageHeartrate ?? undefined,
      maxHeartrate: segment.maxHeartrate ?? lap.maxHeartrate ?? undefined,
      averageCadence: segment.averageCadence ?? lap.cadence ?? undefined,
      averageWatts: segment.averageWatts ?? lap.averageWatts ?? undefined,
      maxWatts: segment.maxWatts ?? lap.maxWatts ?? undefined,
    };
  });

  const metrics = calculateSegmentMetrics(stream, 0, elapsed + 1);
  // The device's lap summaries come first, as for FIT files.
  const lapSeconds =
    laps.length && laps.every((lap) => lap.seconds !== null)
      ? laps.reduce((sum, lap) => sum + lap.seconds!, 0)
      : null;
  const lapDistance =
    laps.length && laps.every((lap) => lap.distance !== null)
      ? laps.reduce((sum, lap) => sum + lap.distance!, 0)
      : null;
  const totalDistance =
    lapDistance ?? (distance ? distance[distance.length - 1] : 0);
  const movingTime =
    lapSeconds !== null
      ? Math.round(lapSeconds)
      : trackMovingTime(time, distance, elapsed);
  const chosen =
    sport ?? tcxSport(activity.getAttribute('Sport')) ?? SPORT_TYPE.OTHER;
  const incomplete =
    details.incomplete ||
    Object.values(channels).some((channel) => channel.incomplete);
  return {
    startDate,
    endDate: new Date(origin + elapsed * 1000),
    details,
    warnings: [
      ...(incomplete ? ['TCX_INCOMPLETE_CHANNELS' as const] : []),
      ...(!hasStream ? ['TCX_NO_STREAM' as const] : []),
      ...(hasStream && !hasGps ? ['TCX_NO_GPS' as const] : []),
      ...(chosen === SPORT_TYPE.OTHER ? ['TCX_UNKNOWN_SPORT' as const] : []),
    ] satisfies ActivityImportWarning[],
    activity: {
      sport: chosen,
      distance: Math.round(totalDistance),
      movingTime,
      elevationGain: channels.altitude.values
        ? elevationGain(channels.altitude.values)
        : 0,
      averageSpeed: movingTime > 0 ? totalDistance / movingTime : 0,
      maxSpeed:
        lapMax(laps.map((lap) => lap.maxSpeed)) ??
        (distance ? maxSpeed(time, distance) : 0),
      averageHeartrate:
        lapAverage(laps, (i) => laps[i].averageHeartrate) ??
        metrics.average_heartrate ??
        null,
      maxHeartrate:
        lapMax(laps.map((lap) => lap.maxHeartrate)) ??
        metrics.max_heartrate ??
        null,
      averageCadence:
        lapAverage(laps, (i) => laps[i].cadence) ??
        metrics.average_cadence ??
        null,
      averageWatts:
        lapAverage(laps, (i) => laps[i].averageWatts) ??
        metrics.average_watts ??
        null,
      maxWatts:
        lapMax(laps.map((lap) => lap.maxWatts)) ?? metrics.max_watts ?? null,
      weightedAverageWatts: null,
      kilojoules: metrics.kilojoules ?? null,
    },
  };
}
