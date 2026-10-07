import { WorkoutTargetContext } from '@openathlete/shared';

import {
  StepRow,
  ZoneRow,
  formatSegments,
  formatSteps,
  heartRateZoneRanges,
  streamSplits,
  summarizeWeather,
  targetMetricTypes,
  timeInHeartRateZones,
} from './ai-tools.activity';

const seconds = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);

const hrZones: ZoneRow[] = [
  {
    trainingZoneId: 1,
    index: 0,
    name: 'Zone 1',
    type: 'HEARTRATE',
    values: [{ min: 100, max: 130, sports: [] }],
  },
  {
    trainingZoneId: 2,
    index: 1,
    name: 'Zone 2',
    type: 'HEARTRATE',
    values: [
      { min: 130, max: 150, sports: [] },
      { min: 125, max: 145, sports: ['CYCLING'] },
    ],
  },
  {
    trainingZoneId: 3,
    index: 2,
    name: 'Zone 3',
    type: 'HEARTRATE',
    values: [{ min: 150, max: 170, sports: [] }],
  },
  {
    trainingZoneId: 4,
    index: 0,
    name: 'Threshold',
    type: 'POWER',
    values: [{ min: 250, max: 280, sports: [] }],
  },
];

const context: WorkoutTargetContext = {
  zones: hrZones,
  metrics: { HR_MAX: 190 },
  sport: 'RUNNING',
};

const step = (overrides: Partial<StepRow>): StepRow => ({
  stepType: 'STEADY',
  name: null,
  notes: null,
  durationType: 'TIME',
  durationValue: 600,
  targets: [],
  repeatBlock: null,
  ...overrides,
});

describe('activity details for the data tools', () => {
  it('splits a run without laps into kilometres of moving time', () => {
    // 2.5 km at 4 m/s, one sample per second, with a 60 s stop at 1.2 km
    const time = seconds(625).map((t) => (t > 300 ? t + 60 : t));
    const splits = streamSplits('RUNNING', {
      time,
      distance: seconds(625).map((i) => i * 4),
      heartrate: seconds(625).map((i) => (i < 250 ? 140 : 160)),
      altitude: seconds(625).map((i) => i / 10),
    });
    expect(splits).toEqual([
      {
        n: 1,
        distanceKm: 1,
        movingTimeSeconds: 250,
        pace: '4:10/km',
        averageHeartrate: 140,
        elevationChangeM: 25,
      },
      // The 61 s stop counts for 15 s (14 more than a normal sample)
      expect.objectContaining({
        n: 2,
        movingTimeSeconds: 264,
        averageHeartrate: 160,
      }),
      expect.objectContaining({ n: 3, distanceKm: 0.5, partial: true }),
    ]);
  });

  it('uses 5 km splits and speed for cycling, and skips streams without distance', () => {
    const splits = streamSplits('CYCLING', {
      time: seconds(1000),
      distance: seconds(1000).map((i) => i * 10),
    });
    expect(splits[0]).toMatchObject({ distanceKm: 5, speedKmh: 36 });
    expect(splits).toHaveLength(2);
    expect(streamSplits('RUNNING', { time: seconds(10) })).toEqual([]);
  });

  it('counts moving time in each heart-rate zone, the higher zone taking shared bounds', () => {
    const heartrate = [
      0,
      ...Array<number>(100).fill(120),
      ...Array<number>(100).fill(130),
      ...Array<number>(50).fill(180),
    ];
    const result = timeInHeartRateZones(
      { time: seconds(250), heartrate },
      heartRateZoneRanges(hrZones, 'RUNNING'),
    );
    expect(result).toEqual({
      zones: [
        { zone: 'Zone 1', bpm: '100-130', seconds: 100, percent: 40 },
        { zone: 'Zone 2', bpm: '130-150', seconds: 100, percent: 40 },
        { zone: 'Zone 3', bpm: '150-170', seconds: 0, percent: 0 },
      ],
      aboveZonesSeconds: 50,
    });
  });

  it('takes the sport-specific range of a zone', () => {
    expect(heartRateZoneRanges(hrZones, 'CYCLING')[1]).toEqual({
      name: 'Zone 2',
      min: 125,
      max: 145,
    });
  });

  it('describes planned steps with absolute targets', () => {
    const steps = [
      step({ stepType: 'WARMUP', durationValue: 900 }),
      step({
        stepType: 'REPEAT',
        repeatBlock: {
          repetitions: 3,
          childSteps: [
            step({
              stepType: 'INTERVAL_ACTIVE',
              durationType: 'DISTANCE',
              durationValue: 2000,
              targets: [
                {
                  targetType: 'PACE',
                  // 4:40 and 4:35 per km
                  targetMin: 1000 / 280,
                  targetMax: 1000 / 275,
                  targetValue: null,
                  metricType: null,
                  zoneReference: null,
                },
              ],
            }),
            step({
              stepType: 'INTERVAL_REST',
              durationValue: 180,
              targets: [
                {
                  targetType: 'HEARTRATE',
                  targetMin: 0.7,
                  targetMax: 0.8,
                  targetValue: null,
                  metricType: 'HR_MAX',
                  zoneReference: null,
                },
              ],
            }),
          ],
        },
      }),
      step({
        stepType: 'COOLDOWN',
        targets: [
          {
            targetType: 'ZONE',
            targetMin: null,
            targetMax: null,
            targetValue: null,
            metricType: null,
            zoneReference: { type: 'HEARTRATE', name: 'Zone 2' },
          },
        ],
      }),
    ];
    expect(formatSteps(steps, context)).toEqual([
      { type: 'WARMUP', duration: '900 s' },
      {
        type: 'REPEAT',
        repeat: 3,
        steps: [
          {
            type: 'INTERVAL_ACTIVE',
            duration: '2 km',
            targets: [{ type: 'PACE', target: '4:35-4:40/km' }],
          },
          {
            type: 'INTERVAL_REST',
            duration: '180 s',
            targets: [
              {
                type: 'HEARTRATE',
                relative: '70-80% of HR_MAX',
                target: '133-152 bpm',
              },
            ],
          },
        ],
      },
      {
        type: 'COOLDOWN',
        duration: '600 s',
        targets: [{ type: 'HEARTRATE', zone: 'Zone 2', target: '130-150 bpm' }],
      },
    ]);
  });

  it('keeps a target relative when the athlete lacks its reference metric', () => {
    const steps = [
      step({
        targets: [
          {
            targetType: 'HEARTRATE',
            targetMin: 0.6,
            targetMax: 0.7,
            targetValue: null,
            metricType: 'HR_RESERVE',
            zoneReference: null,
          },
        ],
      }),
    ];
    expect(targetMetricTypes(steps).sort()).toEqual(['HR_MAX', 'HR_REST']);
    expect(formatSteps(steps, context)[0].targets).toEqual([
      {
        type: 'HEARTRATE',
        relative: '60-70% of HR_RESERVE',
        unresolved: 'WORKOUT_TARGET_MISSING_METRIC',
      },
    ]);
  });

  it('writes laps as pace for runs and speed for rides', () => {
    const lap = {
      segmentType: 'LAP',
      name: null,
      orderIndex: 0,
      startTimeSeconds: 0,
      endTimeSeconds: 300,
      distance: 1000,
      elevationGain: 4.4,
      movingTime: 295,
      averageSpeed: 1000 / 295,
      averageGapSpeed: 1000 / 290,
      averageCadence: 181.6,
      averageWatts: null,
      averageHeartrate: 151.4,
      maxHeartrate: 171,
      workoutStep: { name: null, stepType: 'INTERVAL_ACTIVE' },
    };
    expect(formatSegments('RUNNING', [lap])[0]).toEqual({
      n: 1,
      type: 'LAP',
      startSecond: 0,
      durationSeconds: 300,
      movingTimeSeconds: 295,
      distanceKm: 1,
      pace: '4:55/km',
      gradeAdjustedPace: '4:50/km',
      averageHeartrate: 151,
      maxHeartrate: 171,
      cadence: 182,
      elevationGainM: 4,
      plannedStep: 'INTERVAL_ACTIVE',
    });
    expect(formatSegments('CYCLING', [lap])[0]).toMatchObject({
      speedKmh: 12.2,
    });
  });

  it('summarizes the weather without adding up hourly rain rates', () => {
    expect(
      summarizeWeather([
        {
          distM: 0,
          timeSec: 0,
          lat: 0,
          lon: 0,
          temperatureC: 18,
          precipitationMm: 0.4,
        },
        {
          distM: 500,
          timeSec: 150,
          lat: 0,
          lon: 0,
          temperatureC: 22,
          precipitationMm: 0.6,
        },
      ]),
    ).toMatchObject({
      temperatureC: { min: 18, max: 22, avg: 20 },
      precipitationMaxMmPerHour: 0.6,
    });
    expect(summarizeWeather([])).toBeUndefined();
  });
});
