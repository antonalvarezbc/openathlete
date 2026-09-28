import {
  CreateWorkoutStepDto,
  METRIC_TYPE,
  SPORT_TYPE,
  TRAINING_ZONE_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
  WorkoutTargetError,
  WorkoutTargetZone,
  createWorkoutSchema,
  findWorkoutZone,
  getTargetIntensity,
  mapWorkoutDtoToPrisma,
  mapWorkoutTargets,
  normalizeWorkoutForCreate,
  portableWorkoutTargets,
  resolveWorkoutTarget,
} from '@openathlete/shared';

import { mapWorkoutDtoToGarmin } from '../../providers-sync/mapping/garmin.mapper';
import { prepareWorkoutTargets } from './workout-targets';

const running = SPORT_TYPE.RUNNING;
const zone = (
  id: number,
  name: string,
  min: number,
  max: number,
): WorkoutTargetZone => ({
  trainingZoneId: id,
  name,
  type: TRAINING_ZONE_TYPE.HEARTRATE,
  values: [{ min, max, sports: [running] }],
});
const a = {
  sport: running,
  metrics: { HR_MAX: 200, HR_REST: 60 },
  zones: [zone(47, 'Zone 4', 160, 179), zone(48, 'Zone 0', 0, 99)],
};
const b = {
  sport: running,
  metrics: { HR_MAX: 180, HR_REST: 55 },
  zones: [zone(92, 'Zona 4', 144, 161), zone(90, 'Zona 0', 0, 89)],
};
const percent = {
  targetType: WORKOUT_TARGET_TYPE.HEARTRATE,
  metricType: METRIC_TYPE.HR_MAX,
  targetMin: 0.8,
  targetMax: 0.85,
  targetValue: null,
};
const zoneTarget = { targetType: WORKOUT_TARGET_TYPE.ZONE, targetValue: 47 };
const workout = (target = percent): CreateWorkoutStepDto[] => [
  {
    stepType: WORKOUT_STEP_TYPE.REPEAT,
    durationType: WORKOUT_DURATION_TYPE.OPEN,
    repeatBlock: {
      repetitions: 5,
      childSteps: [
        {
          stepType: WORKOUT_STEP_TYPE.STEADY,
          durationType: WORKOUT_DURATION_TYPE.TIME,
          durationValue: 480,
          targets: [target],
        },
      ],
    },
  },
];

describe('Athlete-relative workout targets', () => {
  it('keeps 5 x 8 min and metric references through normalization, validation and persistence', () => {
    const source = workout();
    const normalized = normalizeWorkoutForCreate({ steps: source });
    const parsed = createWorkoutSchema.parse(normalized);
    const db = mapWorkoutDtoToPrisma(parsed);
    const repeat = db.steps!.create[0].repeatBlock.create;
    expect(repeat.repetitions).toBe(5);
    expect(repeat.childSteps.create[0]).toMatchObject({
      durationValue: 480,
      targets: { create: [percent] },
    });
    expect(source).toEqual(workout());
  });

  it.each([
    [a, 160, 170],
    [b, 144, 153],
  ] as const)(
    'resolves one percentage template for the destination athlete',
    (context, min, max) => {
      const assigned = mapWorkoutTargets(workout(), (target) =>
        resolveWorkoutTarget(target, context),
      );
      expect(assigned[0].repeatBlock!.childSteps[0].targets![0]).toEqual(
        percent,
      );
      const exported = mapWorkoutTargets(assigned, (target) =>
        resolveWorkoutTarget(target, context, true),
      );
      expect(exported[0].repeatBlock!.childSteps[0].targets![0]).toMatchObject({
        targetMin: min,
        targetMax: max,
        metricType: null,
      });
      const garmin = mapWorkoutDtoToGarmin(
        1,
        { eventTrainingId: 1, steps: exported },
        running,
        '5 x 8 min',
      );
      const repeat = garmin.segments[0].steps[0];
      expect(repeat).toMatchObject({ type: 'WorkoutRepeatStep' });
      expect(repeat).toMatchObject({
        repeatValue: 5,
        steps: [
          {
            durationValue: 480,
            targetType: 'HEART_RATE',
            targetValueLow: min,
            targetValueHigh: max,
          },
        ],
      });
    },
  );

  it('turns a legacy athlete zone ID into a portable identity and remaps it to a different athlete', () => {
    const source: CreateWorkoutStepDto[] = [
      { stepType: WORKOUT_STEP_TYPE.STEADY, targets: [zoneTarget] },
    ];
    const portable = portableWorkoutTargets(source, a.zones);
    expect(portable[0].targets![0]).toMatchObject({
      targetValue: null,
      zoneReference: { type: 'HEARTRATE', name: 'Zone 4' },
    });
    const assigned = resolveWorkoutTarget(portable[0].targets![0], b);
    expect(assigned.targetValue).toBe(92);
    expect(resolveWorkoutTarget(assigned, b, true)).toMatchObject({
      targetType: 'HEARTRATE',
      targetMin: 144,
      targetMax: 161,
      targetValue: null,
    });
    expect(source[0].targets![0].targetValue).toBe(47);
  });

  it('does not confuse Zone 0, IDs or display order with the zone number', () => {
    const target = {
      targetType: WORKOUT_TARGET_TYPE.ZONE,
      zoneReference: { type: TRAINING_ZONE_TYPE.HEARTRATE, name: 'Z0' },
    };
    expect(resolveWorkoutTarget(target, b).targetValue).toBe(90);
    expect(resolveWorkoutTarget(target, b, true).targetMin).toBe(0);
  });

  it('prefers sport-specific ranges and falls back only to an explicitly general range', () => {
    const zones = [
      {
        ...a.zones[0],
        values: [
          { min: 150, max: 170, sports: [] },
          { min: 160, max: 179, sports: [running] },
        ],
      },
    ];
    expect(findWorkoutZone(zoneTarget, zones, running).range.min).toBe(160);
    expect(
      findWorkoutZone(zoneTarget, zones, SPORT_TYPE.CYCLING).range.min,
    ).toBe(150);
    expect(() =>
      findWorkoutZone(zoneTarget, a.zones, SPORT_TYPE.CYCLING),
    ).toThrow('WORKOUT_TARGET_MISSING_ZONE');
  });

  it('rejects ambiguous zones and ranges instead of silently choosing the first', () => {
    const target = {
      ...zoneTarget,
      zoneReference: { type: TRAINING_ZONE_TYPE.HEARTRATE, name: 'Zone 4' },
    };
    expect(() =>
      resolveWorkoutTarget(target, {
        ...a,
        zones: [...a.zones, zone(99, 'Zona 4', 150, 160)],
      }),
    ).toThrow('WORKOUT_TARGET_AMBIGUOUS_ZONE');
    expect(() =>
      findWorkoutZone(
        zoneTarget,
        [
          {
            ...a.zones[0],
            values: [...a.zones[0].values, ...a.zones[0].values],
          },
        ],
        running,
      ),
    ).toThrow('WORKOUT_TARGET_AMBIGUOUS_ZONE');
  });

  it('does not guess equivalence between custom zone names', () => {
    expect(() =>
      resolveWorkoutTarget(
        {
          ...zoneTarget,
          zoneReference: {
            type: TRAINING_ZONE_TYPE.HEARTRATE,
            name: 'Threshold',
          },
        },
        a,
      ),
    ).toThrow('WORKOUT_TARGET_MISSING_ZONE');
  });

  it('requires real athlete metrics and never substitutes 190 bpm or the coach’s metric', () => {
    expect(() => resolveWorkoutTarget(percent, { ...a, metrics: {} })).toThrow(
      'WORKOUT_TARGET_MISSING_METRIC',
    );
    expect(getTargetIntensity(percent, {})).toEqual({
      value: null,
      min: null,
      max: null,
    });
    expect(
      getTargetIntensity({ ...percent, metricType: null }, a.metrics).min,
    ).toBe(0.8);
  });

  it('calculates HR reserve with the resting offset and requires both references', () => {
    const reserve = {
      ...percent,
      metricType: METRIC_TYPE.HR_RESERVE,
      targetMin: 0.6,
      targetMax: 0.7,
    };
    const context = { ...a, metrics: { HR_MAX: 195, HR_REST: 60 } };
    expect(resolveWorkoutTarget(reserve, context, true)).toMatchObject({
      targetMin: 141,
      targetMax: 154.5,
    });
    expect(getTargetIntensity(reserve, context.metrics)).toMatchObject({
      min: 141,
      max: 154.5,
    });
    expect(() =>
      resolveWorkoutTarget(reserve, { ...a, metrics: { HR_RESERVE: 135 } }),
    ).toThrow('WORKOUT_TARGET_MISSING_METRIC');
  });

  it.each([
    { ...percent, targetMin: 0.9, targetMax: 0.8 },
    { ...percent, targetMax: 1.1 },
    { ...percent, targetMin: null },
    { ...percent, targetValue: 0.8 },
    { ...percent, metricType: METRIC_TYPE.FTP_CYCLING },
    { ...zoneTarget, metricType: METRIC_TYPE.HR_MAX },
    { ...zoneTarget, targetValue: -4 },
  ])('rejects invalid or incompatible target definitions', (target) => {
    expect(() => resolveWorkoutTarget(target, a)).toThrow(WorkoutTargetError);
  });

  it('rejects malformed portable zone JSON at the request boundary', () => {
    expect(() =>
      createWorkoutSchema.parse({
        steps: [
          {
            stepType: 'STEADY',
            targets: [
              { ...zoneTarget, zoneReference: { type: 'HEARTRATE', name: '' } },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it('does not read a foreign legacy zone ID introduced while editing a template', async () => {
    const db = {
      trainingZone: { findMany: jest.fn() },
      athleteMetric: { findMany: jest.fn() },
    };
    await expect(
      prepareWorkoutTargets(
        db as unknown as Parameters<typeof prepareWorkoutTargets>[0],
        [{ stepType: WORKOUT_STEP_TYPE.STEADY, targets: [zoneTarget] }],
        {
          sport: running,
          portable: true,
          allowedLegacyZoneIds: [],
        },
      ),
    ).rejects.toThrow('WORKOUT_TARGET_MISSING_ZONE');
    expect(db.trainingZone.findMany).not.toHaveBeenCalled();
  });
  it('prefers a sport-specific zone definition over a separate general definition with the same name', () => {
    const zones = [
      {
        ...zone(10, 'Zone 4', 150, 170),
        values: [{ min: 150, max: 170, sports: [] }],
      },
      zone(11, 'Zone 4', 160, 179),
    ];
    const target = {
      targetType: WORKOUT_TARGET_TYPE.ZONE,
      zoneReference: { type: TRAINING_ZONE_TYPE.HEARTRATE, name: 'Zone 4' },
    };
    expect(findWorkoutZone(target, zones, running).zone.trainingZoneId).toBe(
      11,
    );
    expect(
      findWorkoutZone(target, zones, SPORT_TYPE.CYCLING).zone.trainingZoneId,
    ).toBe(10);
  });
});
