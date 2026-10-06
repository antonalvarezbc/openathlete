import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BadRequestException } from '@nestjs/common';

import { uncompressActivityStream } from './activity-stream';
import { prepareManualTcx, tcxSport } from './manual-tcx-import';

type Point = {
  /** Seconds after 07:00:00 UTC. */
  at?: number;
  lat?: number;
  lon?: number;
  ele?: number;
  dist?: number;
  hr?: number;
  cad?: number;
  watts?: number;
  speed?: number;
  runCadence?: number;
};
type Lap = {
  /** Seconds after 07:00:00 UTC. */
  start: number;
  seconds?: number;
  distance?: number;
  maxSpeed?: number;
  avgHr?: number;
  maxHr?: number;
  points?: Point[];
};

const iso = (seconds: number) =>
  new Date(Date.UTC(2026, 9, 3, 7, 0, seconds)).toISOString();

// Synthetic activities only. TPX and LX use another prefix on purpose: only
// local names matter.
function tcx(
  laps: Lap[],
  options: { sport?: string; activities?: number; body?: string } = {},
) {
  const point = (p: Point) =>
    '<Trackpoint>' +
    (p.at === undefined ? '' : `<Time>${iso(p.at)}</Time>`) +
    (p.lat === undefined
      ? ''
      : `<Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lon}</LongitudeDegrees></Position>`) +
    (p.ele === undefined ? '' : `<AltitudeMeters>${p.ele}</AltitudeMeters>`) +
    (p.dist === undefined ? '' : `<DistanceMeters>${p.dist}</DistanceMeters>`) +
    (p.hr === undefined
      ? ''
      : `<HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>`) +
    (p.cad === undefined ? '' : `<Cadence>${p.cad}</Cadence>`) +
    (p.watts === undefined &&
    p.speed === undefined &&
    p.runCadence === undefined
      ? ''
      : '<Extensions><x:TPX>' +
        (p.speed === undefined ? '' : `<x:Speed>${p.speed}</x:Speed>`) +
        (p.watts === undefined ? '' : `<x:Watts>${p.watts}</x:Watts>`) +
        (p.runCadence === undefined
          ? ''
          : `<x:RunCadence>${p.runCadence}</x:RunCadence>`) +
        '</x:TPX></Extensions>') +
    '</Trackpoint>';
  const lap = (l: Lap) =>
    `<Lap StartTime="${iso(l.start)}">` +
    (l.seconds === undefined
      ? ''
      : `<TotalTimeSeconds>${l.seconds}</TotalTimeSeconds>`) +
    (l.distance === undefined
      ? ''
      : `<DistanceMeters>${l.distance}</DistanceMeters>`) +
    (l.maxSpeed === undefined
      ? ''
      : `<MaximumSpeed>${l.maxSpeed}</MaximumSpeed>`) +
    (l.avgHr === undefined
      ? ''
      : `<AverageHeartRateBpm><Value>${l.avgHr}</Value></AverageHeartRateBpm>`) +
    (l.maxHr === undefined
      ? ''
      : `<MaximumHeartRateBpm><Value>${l.maxHr}</Value></MaximumHeartRateBpm>`) +
    '<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>' +
    (l.points ? `<Track>${l.points.map(point).join('')}</Track>` : '') +
    '</Lap>';
  const activity = `<Activity Sport="${options.sport ?? 'Running'}"><Id>${iso(laps[0]?.start ?? 0)}</Id>${laps.map(lap).join('')}</Activity>`;
  const body =
    options.body ??
    `<Activities>${activity.repeat(options.activities ?? 1)}</Activities>`;
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:x="http://www.garmin.com/xmlschemas/ActivityExtension/v2">${body}</TrainingCenterDatabase>`,
  );
}

/** A point every 10 s moving 0.0002 degrees north (~22 m, 2.2 m/s). */
const run = (from: number, count: number, extra: Partial<Point> = {}) =>
  Array.from({ length: count }, (_, i) => ({
    at: (from + i) * 10,
    lat: 43.36 + (from + i) * 0.0002,
    lon: -8.41,
    ele: 10,
    hr: 140,
    ...extra,
  }));

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
};

describe('prepareManualTcx', () => {
  it('accepts the synthetic run used by the end-to-end tests', () => {
    const result = prepareManualTcx(
      readFileSync(
        join(__dirname, '../../../../../../e2e/fixtures/synthetic-run.tcx'),
      ),
    );
    expect(result.startDate).toEqual(new Date('2024-05-03T07:00:00Z'));
    expect(result.activity.sport).toBe('RUNNING');
    expect(result.activity.distance).toBe(1500);
    expect(result.activity.movingTime).toBe(600);
    expect(result.details.segments).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });

  it('reads the laps, the track and the device summary', () => {
    const result = prepareManualTcx(
      tcx([
        {
          start: 0,
          seconds: 90,
          distance: 200,
          maxSpeed: 3.1,
          avgHr: 138,
          maxHr: 150,
          points: run(0, 10),
        },
        {
          start: 100,
          seconds: 90,
          distance: 210,
          avgHr: 142,
          maxHr: 155,
          points: run(10, 10),
        },
      ]),
    );
    const stream = uncompressActivityStream(result.details.stream);
    expect(result.startDate).toEqual(new Date('2026-10-03T07:00:00Z'));
    expect(+result.endDate - +result.startDate).toBe(190_000);
    expect(stream.time).toHaveLength(20);
    expect(stream.latlng).toHaveLength(20);
    expect(stream.heartrate).toHaveLength(20);
    expect(result.activity).toMatchObject({
      sport: 'RUNNING',
      // The device's lap distances and timer time come first
      distance: 410,
      movingTime: 180,
      maxSpeed: 3.1,
      averageHeartrate: 140,
      maxHeartrate: 155,
    });
    expect(result.details.segments).toEqual([
      expect.objectContaining({ startTimeSeconds: 0, endTimeSeconds: 100 }),
      expect.objectContaining({ startTimeSeconds: 100, endTimeSeconds: 190 }),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('computes what the laps lack from the track, as for GPX', () => {
    const result = prepareManualTcx(
      tcx([{ start: 0, points: run(0, 20) }], { sport: 'Biking' }),
    );
    expect(result.activity.sport).toBe('CYCLING');
    // 19 steps of ~22 m, moving all the time
    expect(result.activity.distance).toBeGreaterThan(400);
    expect(result.activity.distance).toBeLessThan(440);
    expect(result.activity.movingTime).toBe(190);
    expect(result.activity.averageHeartrate).toBe(140);
  });

  it('keeps GPS gaps on the time axis and drops impossible jumps', () => {
    const points: Point[] = run(0, 8);
    delete points[3].lat;
    delete points[3].lon;
    // 1.1 km ahead in ten seconds (400 km/h): a glitch
    points[5] = { ...points[5], lat: points[5].lat! + 0.01 };
    const result = prepareManualTcx(tcx([{ start: 0, points }]));
    const stream = uncompressActivityStream(result.details.stream);
    expect(stream.time).toHaveLength(8);
    expect(stream.latlng![3]).toEqual([]);
    expect(stream.latlng![5]).toEqual([]);
    expect(result.activity.distance).toBeLessThan(170);
  });

  it('prefers the distance the device recorded', () => {
    // A foot pod: no positions, the device's own distance
    const points = run(0, 5).map(({ at, hr }, i) => ({
      at,
      hr,
      dist: i * 25,
    }));
    const result = prepareManualTcx(tcx([{ start: 0, points }]));
    const stream = uncompressActivityStream(result.details.stream);
    expect(stream.distance).toEqual([0, 25, 50, 75, 100]);
    expect(stream.latlng).toBeUndefined();
    expect(result.activity.distance).toBe(100);
    expect(result.warnings).toEqual(['TCX_NO_GPS']);
  });

  it('reads TPX watts, speed and run cadence whatever their prefix', () => {
    const points = run(0, 5).map(({ at }) => ({
      at,
      watts: 250,
      speed: 3,
      runCadence: 88,
    }));
    const result = prepareManualTcx(tcx([{ start: 0, points }]));
    const stream = uncompressActivityStream(result.details.stream);
    expect(stream.watts).toEqual([250, 250, 250, 250, 250]);
    expect(stream.cadence).toEqual([88, 88, 88, 88, 88]);
    // Without positions or device distance, the speed gives the distance
    expect(stream.distance).toEqual([0, 30, 60, 90, 120]);
    expect(result.activity.averageWatts).toBe(250);
  });

  it('fills short sensor gaps and leaves out a sensor too often missing', () => {
    const points: Point[] = run(0, 20);
    points[4].hr = undefined;
    for (const point of points.slice(0, 10)) point.cad = 80;
    const result = prepareManualTcx(tcx([{ start: 0, points }]));
    const stream = uncompressActivityStream(result.details.stream);
    expect(stream.heartrate![4]).toBe(140);
    expect(stream.cadence).toBeUndefined();
    expect(result.warnings).toContain('TCX_INCOMPLETE_CHANNELS');
  });

  it('drops points going back in time', () => {
    const points: Point[] = run(0, 4);
    points.splice(2, 0, { ...points[1], at: 5 });
    const stream = uncompressActivityStream(
      prepareManualTcx(tcx([{ start: 0, points }])).details.stream,
    );
    expect(stream.time).toEqual([0, 10, 20, 30]);
  });

  it('imports a summary-only activity from its laps', () => {
    const result = prepareManualTcx(
      tcx([
        { start: 0, seconds: 600, distance: 2000, avgHr: 150 },
        { start: 600, seconds: 300, distance: 900, avgHr: 160 },
      ]),
    );
    expect(result.details.stream.time).toBeUndefined();
    expect(result.activity).toMatchObject({
      distance: 2900,
      movingTime: 900,
      averageHeartrate: 153.33333333333334,
    });
    expect(result.details.segments[1]).toMatchObject({
      startTimeSeconds: 600,
      endTimeSeconds: 900,
      distance: 900,
    });
    expect(result.warnings).toEqual(['TCX_NO_STREAM']);
  });

  it('uses the chosen sport, else the activity, else Other', () => {
    expect(
      prepareManualTcx(
        tcx([{ start: 0, points: run(0, 3) }]),
        'HIKING' as never,
      ).activity.sport,
    ).toBe('HIKING');
    const other = prepareManualTcx(
      tcx([{ start: 0, points: run(0, 3) }], { sport: 'Other' }),
    );
    expect(other.activity.sport).toBe('OTHER');
    expect(other.warnings).toContain('TCX_UNKNOWN_SPORT');
  });

  it('refuses multisport files, courses and activities without times', () => {
    expectCode(
      () =>
        prepareManualTcx(
          tcx([{ start: 0, points: run(0, 3) }], { activities: 2 }),
        ),
      'TCX_MULTISPORT_UNSUPPORTED',
    );
    expectCode(
      () =>
        prepareManualTcx(
          tcx([], {
            body: '<Activities><MultiSportSession/></Activities>',
          }),
        ),
      'TCX_MULTISPORT_UNSUPPORTED',
    );
    expectCode(
      () =>
        prepareManualTcx(
          tcx([], {
            body: '<Courses><Course><Name>Plan</Name></Course></Courses>',
          }),
        ),
      'TCX_NO_TIME',
    );
    // Neither the points nor the lap have a time
    const untimed = tcx([
      { start: 0, points: run(0, 3).map(({ lat, lon }) => ({ lat, lon })) },
    ])
      .toString('utf-8')
      .replace(/ StartTime="[^"]*"/, '');
    expectCode(() => prepareManualTcx(Buffer.from(untimed)), 'TCX_NO_TIME');
  });

  it('refuses files that are not TCX, future activities and huge files', () => {
    expectCode(() => prepareManualTcx(Buffer.from('not xml <')), 'TCX_INVALID');
    expectCode(
      () => prepareManualTcx(Buffer.from('<gpx version="1.1"></gpx>')),
      'TCX_INVALID',
    );
    const future = run(0, 3).map((p) => ({ ...p, at: p.at + 400 * 86400 }));
    expectCode(
      () => prepareManualTcx(tcx([{ start: 400 * 86400, points: future }])),
      'TCX_INVALID',
    );
    const huge = Array.from({ length: 100001 }, (_, i) => ({ at: i }));
    expectCode(
      () => prepareManualTcx(tcx([{ start: 0, points: huge }])),
      'TCX_LIMIT',
    );
    const laps = Array.from({ length: 1001 }, (_, i) => ({
      start: i,
      seconds: 1,
    }));
    expectCode(() => prepareManualTcx(tcx(laps)), 'TCX_LIMIT');
  });
});

describe('tcxSport', () => {
  it('recognizes the two sports TCX names', () => {
    expect(tcxSport('Running')).toBe('RUNNING');
    expect(tcxSport('Biking')).toBe('CYCLING');
    expect(tcxSport('Other')).toBeUndefined();
    expect(tcxSport(null)).toBeUndefined();
  });
});
