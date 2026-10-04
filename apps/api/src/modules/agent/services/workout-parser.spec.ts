import { METRIC_TYPE } from '@openathlete/shared';

import { PrismaService } from '../../prisma/services/prisma.service';
import {
  ParsedWorkout,
  SESSION_FIELDS_HINT,
  WORKOUT_PARSER_INSTRUCTIONS,
  buildWorkoutParserPrompt,
  mentionsMetrics,
  mentionsZones,
  parsedWorkoutToSteps,
  toSportType,
} from './workout-parser';
import { WorkoutParserService } from './workout-parser.service';

jest.mock('src/mastra/agents', () => ({ workoutParserAgent: {} }));

const step = (
  type: ParsedWorkout['blocks'][number]['step'] extends infer S
    ? S extends { type: infer T }
      ? T
      : never
    : never,
  duration: 'TIME' | 'DISTANCE' | 'LAP_BUTTON',
  value: number | null,
  extra: Partial<NonNullable<ParsedWorkout['blocks'][number]['step']>> = {},
) => ({ type, duration, value, note: null, targets: [], ...extra });

// "15-20' calentar + 3x8' a RPE 6-7, aprox. 4:35-4:40/km, recuperación 3'
// trote muy suave + enfriar", as the model is asked to return it.
const example: ParsedWorkout = {
  blocks: [
    {
      step: step('WARMUP', 'TIME', 900, { note: "15-20'" }),
      repeat: null,
    },
    {
      step: null,
      repeat: {
        times: 3,
        steps: [
          step('INTERVAL_ACTIVE', 'TIME', 480, {
            targets: [
              { type: 'RPE', min: 6, max: 7, value: null, metric: null },
              {
                type: 'PACE',
                min: 4.583,
                max: 4.667,
                value: null,
                metric: null,
              },
            ],
          }),
          step('INTERVAL_REST', 'TIME', 180, { note: 'trote muy suave' }),
        ],
      },
    },
    { step: step('COOLDOWN', 'LAP_BUTTON', null), repeat: null },
  ],
};

describe('parsedWorkoutToSteps', () => {
  it('builds warm-up, one repeat group and an open cool-down', () => {
    const [warmup, repeat, cooldown] = parsedWorkoutToSteps(example);
    expect(warmup).toMatchObject({
      stepType: 'WARMUP',
      durationType: 'TIME',
      durationValue: 900,
      notes: "15-20'",
    });
    expect(repeat).toMatchObject({
      stepType: 'REPEAT',
      repeatBlock: { repetitions: 3 },
    });
    const [work, rest] = repeat.repeatBlock!.childSteps;
    expect(work).toMatchObject({
      stepType: 'INTERVAL_ACTIVE',
      durationValue: 480,
      notes: 'RPE 6-7',
    });
    expect(rest).toMatchObject({
      stepType: 'INTERVAL_REST',
      durationValue: 180,
      notes: 'trote muy suave',
    });
    expect(cooldown).toMatchObject({
      stepType: 'COOLDOWN',
      durationType: 'LAP_BUTTON',
      durationValue: null,
    });
  });

  it('stores one whole RPE and an absolute pace in m/s, slower first', () => {
    const [, repeat] = parsedWorkoutToSteps(example);
    const [rpe, pace] = repeat.repeatBlock!.childSteps[0].targets!;
    expect(rpe).toEqual({ targetType: 'RPE', targetValue: 7 });
    // 4:40/km = 3.571 m/s, 4:35/km = 3.636 m/s
    expect(pace.targetType).toBe('PACE');
    expect(pace.targetMin).toBeCloseTo(1000 / (4.667 * 60), 6);
    expect(pace.targetMax).toBeCloseTo(1000 / (4.583 * 60), 6);
    expect(pace.targetValue).toBeNull();
  });

  it('keeps percentages relative and only zones of this athlete', () => {
    const [hr, zone] = parsedWorkoutToSteps(
      {
        blocks: [
          {
            step: step('STEADY', 'TIME', 1800, {
              targets: [
                {
                  type: 'HEARTRATE',
                  min: 0.7,
                  max: 0.8,
                  value: null,
                  metric: METRIC_TYPE.HR_MAX,
                },
              ],
            }),
            repeat: null,
          },
          {
            step: step('STEADY', 'DISTANCE', 5000, {
              targets: [
                { type: 'ZONE', min: null, max: null, value: 26, metric: null },
                { type: 'ZONE', min: null, max: null, value: 99, metric: null },
              ],
            }),
            repeat: null,
          },
        ],
      },
      [26],
    );
    expect(hr.targets).toEqual([
      {
        targetType: 'HEARTRATE',
        targetMin: 0.7,
        targetMax: 0.8,
        targetValue: null,
        metricType: 'HR_MAX',
      },
    ]);
    expect(zone).toMatchObject({
      durationType: 'DISTANCE',
      durationValue: 5000,
    });
    expect(zone.targets).toEqual([{ targetType: 'ZONE', targetValue: 26 }]);
  });

  it('drops empty repeats and clamps repetitions', () => {
    const result = parsedWorkoutToSteps({
      blocks: [
        { step: null, repeat: { times: 4, steps: [] } },
        {
          step: null,
          repeat: { times: 250, steps: [step('INTERVAL_ACTIVE', 'TIME', 30)] },
        },
        { step: null, repeat: null },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].repeatBlock!.repetitions).toBe(99);
  });
});

describe('prompt size', () => {
  it('sends zones and metrics only when the text refers to them', () => {
    expect(mentionsZones("3x8' a 4:35/km")).toBe(false);
    expect(mentionsZones("20' en Z2")).toBe(true);
    expect(mentionsZones('rodaje zona 2')).toBe(true);
    expect(mentionsMetrics("3x8' RPE 6-7")).toBe(false);
    expect(mentionsMetrics("10' al 85% FCmax")).toBe(true);
    expect(mentionsMetrics("4x4' a VMA")).toBe(true);
    expect(buildWorkoutParserPrompt({ text: "3x8'", sport: 'RUNNING' })).toBe(
      "Sport: RUNNING\nText: 3x8'",
    );
  });

  it('asks for a name and the sport only when the sport is unknown', () => {
    expect(buildWorkoutParserPrompt({ text: "3x8'" })).toBe(
      `${SESSION_FIELDS_HINT}\nText: 3x8'`,
    );
    expect(toSportType('trail running')).toBe('TRAIL_RUNNING');
    expect(toSportType(' cycling ')).toBe('CYCLING');
    expect(toSportType('parkour')).toBeUndefined();
    expect(toSportType(null)).toBeUndefined();
  });

  it('keeps the fixed instructions short', () => {
    // Roughly 4 characters per token: well under 400 tokens.
    expect(WORKOUT_PARSER_INSTRUCTIONS.length).toBeLessThan(1600);
  });
});

describe('WorkoutParserService', () => {
  class TestParser extends WorkoutParserService {
    model = jest.fn().mockResolvedValue(example);
    protected callModel(prompt: string, session: boolean) {
      return this.model(prompt, session);
    }
  }
  const setup = () => {
    const prisma = {
      trainingZone: {
        findMany: jest.fn().mockResolvedValue([
          {
            trainingZoneId: 26,
            type: 'HEARTRATE',
            index: 0,
            name: 'Z2',
            description: '',
            values: [{ min: 130, max: 145, sports: [] }],
          },
        ]),
      },
      athleteMetric: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { type: 'HR_MAX', value: 190, date: new Date('2026-09-01') },
          ]),
      },
    };
    return {
      prisma,
      service: new TestParser(prisma as unknown as PrismaService),
    };
  };

  it('reads no athlete data for a plain text', async () => {
    const { service, prisma } = setup();
    await service.parse({
      text: "3x8' a 4:35/km",
      sport: 'RUNNING',
      athleteId: 7,
    });
    expect(prisma.trainingZone.findMany).not.toHaveBeenCalled();
    expect(prisma.athleteMetric.findMany).not.toHaveBeenCalled();
    expect(service.model).toHaveBeenCalledWith(
      "Sport: RUNNING\nText: 3x8' a 4:35/km",
      false,
    );
  });

  it('names a new session and checks the sport it picks', async () => {
    const { service } = setup();
    service.model.mockResolvedValueOnce({
      ...example,
      name: "  3x8' a umbral  ",
      sport: 'running',
    });
    const session = await service.parseSession({ text: "3x8' a 4:35/km" });
    expect(service.model.mock.calls[0][1]).toBe(true);
    expect(session).toMatchObject({ name: "3x8' a umbral", sport: 'RUNNING' });
    expect(session.steps).toHaveLength(3);

    service.model.mockResolvedValueOnce({
      ...example,
      name: '',
      sport: 'Quidditch',
    });
    const unknown = await service.parseSession({ text: "4x4' fuerte" });
    expect(unknown.name).toBeUndefined();
    expect(unknown.sport).toBeUndefined();
    // Sessions with a known sport get only steps.
    const steps = await service.parse({
      text: "4x4' fuerte",
      sport: 'RUNNING',
    });
    expect(Array.isArray(steps)).toBe(true);
  });

  it('adds only the zones or metrics the text refers to', async () => {
    const { service, prisma } = setup();
    await service.parse({
      text: "20' en Z2 + 5' al 90% FCmax",
      sport: 'RUNNING',
      athleteId: 7,
    });
    const prompt: string = service.model.mock.calls[0][0];
    expect(prompt).toContain('Zone ID 26 Z2: 130-145');
    expect(prompt).toContain('Metrics: HR_MAX 190');
    expect(prisma.trainingZone.findMany).toHaveBeenCalledTimes(1);
  });

  it('answers the same text again without calling the model', async () => {
    const { service } = setup();
    const first = await service.parse({
      text: "3x8'   a 4:35/km",
      sport: 'RUNNING',
      athleteId: 7,
    });
    // Whitespace differences do not matter.
    const second = await service.parse({
      text: "3x8' a 4:35/km",
      sport: 'RUNNING',
      athleteId: 7,
    });
    expect(service.model).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    // Callers get their own copy.
    expect(second).not.toBe(first);
    // Another athlete or sport is a new conversion.
    await service.parse({
      text: "3x8' a 4:35/km",
      sport: 'RUNNING',
      athleteId: 8,
    });
    await service.parse({
      text: "3x8' a 4:35/km",
      sport: 'CYCLING',
      athleteId: 7,
    });
    expect(service.model).toHaveBeenCalledTimes(3);
  });
});
