import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  AI_PLAN_ISSUE_CODES,
  AI_PLAN_RULES,
  AI_PLAN_RULE_KEYS,
  AiPlanRequest,
  CYCLE_PHASE,
  DEFAULT_AI_PLAN_RULES,
  SPORT_TYPE,
  applyAiPlanRules,
  trainingPlanImportSchema,
} from '@openathlete/shared';

import { planGenerationAgent } from '../../../mastra/agents/plan-generation.agent';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { AiPlanOutput, describeIssue, toImportPlan } from './plan-generation';
import {
  PLAN_MAX_OUTPUT_TOKENS,
  PlanGenerationService,
} from './plan-generation.service';
import { WorkoutParserService } from './workout-parser.service';

jest.mock('../../../mastra/agents/plan-generation.agent', () => ({
  planGenerationAgent: { generate: jest.fn() },
}));
jest.mock('src/mastra/agents', () => ({ workoutParserAgent: {} }));

const NOW = new Date('2030-10-20T12:00:00Z');
const request: AiPlanRequest = {
  athleteId: 4,
  goal: {
    name: '10K',
    date: '2030-12-14',
    sport: SPORT_TYPE.RUNNING,
    distanceKm: 10,
    timeTarget: 2700,
  },
  startDate: '2030-10-21',
  timeZone: 'Europe/Madrid',
  sports: [SPORT_TYPE.RUNNING],
  trainingDays: [2, 4, 6],
  weeklyHours: 5,
  language: 'es',
};
const GOOD = [180, 195, 210, 160, 220, 240, 170, 100];

/** The model's answer for the given weekly minutes. */
function answer(
  minutes: number[],
  sport = 'RUNNING',
  rules: AiPlanOutput['rules'] = [],
): AiPlanOutput {
  return {
    rules,
    name: 'Plan 10K',
    description: 'Polarized build',
    cycles: [
      {
        name: 'Build',
        description: 'Aerobic base',
        phase: CYCLE_PHASE.BASE,
        weeks: minutes.map((total, index) => {
          const days =
            index === minutes.length - 1
              ? (['TUESDAY', 'THURSDAY'] as const)
              : (['TUESDAY', 'THURSDAY', 'SATURDAY'] as const);
          return {
            weekNumber: index + 1,
            theme: `Week ${index + 1}`,
            sessions: days.map((day) => ({
              day,
              sport,
              name: `Run ${day}`,
              description: "10' warm-up + 20' easy",
              minutes: total / days.length,
              rpe: 4,
              distanceKm: 0,
            })),
          };
        }),
      },
    ],
  };
}

const coach = {
  userId: 3,
  email: 'coach@example.test',
  roles: ['COACH'],
  athlete: { athleteId: 30 },
} as AuthUser;

class TestService extends PlanGenerationService {
  answers: Array<{
    object: AiPlanOutput | null;
    raw: string;
    truncated?: boolean;
  }> = [];
  prompts: Array<Record<string, unknown>> = [];
  protected async callModel(prompt: string) {
    this.prompts.push(JSON.parse(prompt));
    return this.answers.shift() ?? { object: null, raw: '' };
  }
}

// The goal race in the calendar, and a tune-up linked to another plan.
const races = [
  {
    eventId: 51,
    name: 'Tune-up 5K',
    startDate: new Date('2030-11-16T09:00:00Z'),
    competition: {
      sport: 'RUNNING',
      description: `Hilly. ${'x'.repeat(400)}`,
      goalDistance: 5000,
      goalElevationGain: null,
      goalDuration: 1200,
      planRaces: [{ priority: 'PREPARATORY' }],
    },
  },
  {
    eventId: 50,
    name: '10K',
    startDate: new Date('2030-12-14T08:00:00Z'),
    competition: {
      sport: 'RUNNING',
      description: '  Flat and fast  ',
      goalDistance: 10000,
      goalElevationGain: 20,
      goalDuration: 2700,
      planRaces: [],
    },
  },
];
const events: Record<number, { athleteId: number; type: string }> = {
  50: { athleteId: 4, type: 'COMPETITION' },
  51: { athleteId: 4, type: 'COMPETITION' },
  60: { athleteId: 99, type: 'COMPETITION' },
  61: { athleteId: 4, type: 'TRAINING' },
};

function setup() {
  const prisma = {
    coachAthlete: {
      findFirst: jest.fn().mockResolvedValue({ coachAthleteId: 1 }),
    },
    athleteMetric: {
      findMany: jest.fn().mockResolvedValue([
        { type: 'HR_MAX', value: 190, date: NOW },
        { type: 'HR_MAX', value: 185, date: new Date('2030-01-01') },
      ]),
    },
    trainingZone: {
      findMany: jest.fn().mockResolvedValue(
        ['Zone 1', 'Zone 2', 'Zone 3'].map((name, index) => ({
          trainingZoneId: index + 1,
          type: 'HEARTRATE',
          index,
          name,
          description: '',
          values: [
            { min: 100 + index * 20, max: 119 + index * 20, sports: [] },
          ],
        })),
      ),
    },
    athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
    event: {
      findMany: jest.fn(async ({ where }: { where: { type: string } }) =>
        where.type === 'ACTIVITY'
          ? [
              // 200, 280 and 120 minutes in the last three weeks
              {
                startDate: new Date('2030-10-18T08:00:00Z'),
                activity: { sport: 'RUNNING', movingTime: 12000 },
              },
              {
                startDate: new Date('2030-10-11T08:00:00Z'),
                activity: { sport: 'RUNNING', movingTime: 16800 },
              },
              {
                startDate: new Date('2030-10-01T08:00:00Z'),
                activity: { sport: 'RUNNING', movingTime: 7200 },
              },
            ]
          : where.type === 'COMPETITION'
            ? races
            : [],
      ),
      findUnique: jest.fn(async ({ where }: { where: { eventId: number } }) =>
        events[where.eventId]
          ? { eventId: where.eventId, ...events[where.eventId] }
          : null,
      ),
      count: jest.fn().mockResolvedValue(2),
    },
    trainingPlan: {
      findMany: jest.fn().mockResolvedValue([
        {
          trainingPlanId: 7,
          name: 'Old plan',
          startDate: new Date('2030-09-01T00:00:00Z'),
          endDate: new Date('2030-11-01T00:00:00Z'),
          status: 'ACTIVE',
        },
      ]),
    },
  };
  const queue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getJob: jest.fn(),
  };
  const parser = { parse: jest.fn() };
  const service = new TestService(
    prisma as unknown as PrismaService,
    parser as unknown as WorkoutParserService,
    queue as never,
  );
  return { prisma, queue, parser, service };
}

beforeAll(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setImmediate'] });
});
afterAll(() => jest.useRealTimers());

describe('toImportPlan', () => {
  test('turns the model answer into a valid plan import', () => {
    const plan = toImportPlan(answer(GOOD), request);
    expect(trainingPlanImportSchema.safeParse(plan).success).toBe(true);
    expect(plan.plan).toMatchObject({
      name: 'Plan 10K',
      goal: '10K',
      sportType: 'RUNNING',
      distance: 10000,
      duration: 8,
      timeTarget: 2700,
    });
    const first = plan.cycles[0].weeks[0].sessions[0];
    // Tuesday is 2 in plan files, where Sunday is 0.
    expect(first).toMatchObject({
      dayOfWeek: 2,
      goalDuration: 3600,
      goalRpe: 4,
    });
  });

  test('keeps values in range and lets an unknown sport fail validation', () => {
    const output = answer(GOOD, 'running');
    output.cycles[0].weeks[0].sessions[0].rpe = 14;
    output.cycles[0].weeks[0].sessions[1].distanceKm = 8.5;
    const plan = toImportPlan(output, request);
    expect(plan.cycles[0].weeks[0].sessions[0]).toMatchObject({
      sport: 'RUNNING',
      goalRpe: 10,
    });
    expect(plan.cycles[0].weeks[0].sessions[1].goalDistance).toBe(8500);
    expect(
      trainingPlanImportSchema.safeParse(
        toImportPlan(answer(GOOD, 'parkour'), request),
      ).success,
    ).toBe(false);
  });

  test('describes every check result for the repair round', () => {
    for (const code of AI_PLAN_ISSUE_CODES)
      expect(describeIssue({ code, week: 2, value: 10, limit: 5 })).toMatch(
        /\w/,
      );
  });
});

describe('PlanGenerationService.generate', () => {
  test('returns a clean draft without a repair round', async () => {
    const { service, prisma } = setup();
    service.answers = [{ object: answer(GOOD), raw: '' }];
    const stage = jest.fn();
    const draft = await service.generate(request, stage);
    expect(service.prompts).toHaveLength(1);
    expect(stage).not.toHaveBeenCalled();
    expect(draft.issues).toEqual([]);
    expect(draft.plan?.plan.duration).toBe(8);
    expect(draft.facts).toMatchObject({
      weeks: 8,
      injuries: 0,
      zoneNumbers: [1, 2, 3],
      metrics: ['HR_MAX'],
      // (200 + 280 + 120 + 0) / 4
      recentWeeklyMinutes: 150,
    });
    expect(draft.conflicts).toEqual({
      sessions: 2,
      plans: [
        expect.objectContaining({
          trainingPlanId: 7,
          startDate: '2030-09-01T00:00:00.000Z',
        }),
      ],
    });
    // The prompt carries the schedule and only the latest metric values.
    const prompt = service.prompts[0] as {
      schedule: {
        weekStarts: string[];
        raceWeekday: string;
        trainingDays: string[];
      };
      athlete: { metrics: Record<string, number> };
    };
    expect(prompt.schedule.weekStarts).toHaveLength(8);
    expect(prompt.schedule.weekStarts[1]).toBe('2030-10-28');
    expect(prompt.schedule.raceWeekday).toBe('SATURDAY');
    expect(prompt.schedule.trainingDays).toEqual([
      'TUESDAY',
      'THURSDAY',
      'SATURDAY',
    ]);
    expect(prompt.athlete.metrics).toEqual({ HR_MAX: 190 });
    expect(prisma.athleteInjury.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { athleteId: 4, status: { not: 'RESOLVED' } },
      }),
    );
  });

  test('sends the problems back once and keeps the repaired draft', async () => {
    const { service } = setup();
    const tooFast = [...GOOD];
    tooFast[1] = 300;
    service.answers = [
      { object: answer(tooFast), raw: '' },
      { object: answer(GOOD), raw: '' },
    ];
    const stage = jest.fn();
    const draft = await service.generate(request, stage);
    expect(stage).toHaveBeenCalledWith('repairing');
    const revision = service.prompts[1].revision as {
      problems: string[];
      previousDraft: AiPlanOutput;
    };
    expect(revision.problems.join('\n')).toMatch(/week 2: 300 minutes/);
    expect(revision.previousDraft.cycles[0].weeks[1].weekNumber).toBe(2);
    expect(draft.issues).toEqual([]);
    expect(service.prompts).toHaveLength(2);
  });

  test('keeps the first draft and its issues when the repair breaks the format', async () => {
    const { service } = setup();
    const tooFast = [...GOOD];
    tooFast[1] = 300;
    service.answers = [
      { object: answer(tooFast), raw: '' },
      { object: null, raw: 'not json' },
    ];
    const draft = await service.generate(request);
    expect(draft.plan?.cycles[0].weeks[1].sessions[0].goalDuration).toBe(6000);
    expect(draft.issues.map((issue) => issue.code)).toContain('PROGRESSION');
  });

  test('repairs a draft that does not fit the import format', async () => {
    const { service } = setup();
    service.answers = [
      { object: answer(GOOD, 'parkour'), raw: '' },
      { object: answer(GOOD), raw: '' },
    ];
    const draft = await service.generate(request);
    const problems = (service.prompts[1].revision as { problems: string[] })
      .problems;
    expect(problems[0]).toMatch(/sport/);
    expect(draft.plan).not.toBeNull();
  });

  test('fails as an invalid answer when both answers are unusable, and logs why', async () => {
    const { service } = setup();
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    service.answers = [
      { object: null, raw: '{"name":', truncated: true },
      { object: null, raw: '' },
    ];
    await expect(service.generate(request)).rejects.toMatchObject({
      name: 'AiPlanFailureError',
      reason: 'INVALID_ANSWER',
      detail: 'TRUNCATED',
    });
    // The raw text of a malformed answer is what the repair sees.
    expect(
      (service.prompts[1].revision as { previousDraft: string }).previousDraft,
    ).toBe('{"name":');
    const logged = warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toMatch(/invalid after the repair round/);
    expect(logged).toMatch(/model=\S+/);
    expect(logged).toMatch(/truncated=true answer=8\/0 chars/);
    expect(logged).toMatch(/problems=\[".*required format/);
    // Never the prompt.
    expect(logged).not.toContain('weekStarts');
    warn.mockRestore();
  });

  test('treats no recent activity as unknown and counts injuries', async () => {
    const { service, prisma } = setup();
    prisma.event.findMany.mockImplementation(async () => []);
    prisma.athleteInjury.findMany.mockResolvedValue([
      {
        location: 'knee',
        painScore: 3,
        status: 'STABLE',
        context: 'x'.repeat(500),
      },
    ]);
    service.answers = [{ object: answer(GOOD), raw: '' }];
    const draft = await service.generate(request);
    expect(draft.facts.recentWeeklyMinutes).toBeNull();
    expect(draft.facts.injuries).toBe(1);
    const injuries = (
      service.prompts[0] as {
        athlete: { injuries: Array<{ context: string }> };
      }
    ).athlete.injuries;
    expect(injuries[0].context).toHaveLength(300);
  });
});

describe('PlanGenerationService plan rules', () => {
  test('uses the defaults when the AI keeps them', async () => {
    const { service } = setup();
    service.answers = [{ object: answer(GOOD), raw: '' }];
    const draft = await service.generate(request);
    expect(draft.rules).toEqual(DEFAULT_AI_PLAN_RULES);
    expect(draft.ruleNotes.every((note) => note.source === 'default')).toBe(
      true,
    );
  });

  test("checks the plan with the rules the AI set from the coach's notes", async () => {
    const { service } = setup();
    // 20% growth in week 2 fails the default 10% but fits "15% progression".
    const minutes = [...GOOD];
    minutes[1] = 230;
    service.answers = [
      {
        object: answer(minutes, 'RUNNING', [
          {
            rule: 'growthPercent',
            value: 15,
            reason: 'El entrenador pide un 15 %',
          },
          { rule: 'growthMinutes', value: 30, reason: 'Margen pedido' },
        ]),
        raw: '',
      },
    ];
    const draft = await service.generate({
      ...request,
      methodologyNotes: 'progresión del 15 %',
    });
    expect(service.prompts).toHaveLength(1);
    expect(draft.issues).toEqual([]);
    expect(draft.rules).toMatchObject({ growthPercent: 15, growthMinutes: 30 });
    expect(draft.ruleNotes).toContainEqual({
      rule: 'growthPercent',
      source: 'ai',
      reason: 'El entrenador pide un 15 %',
    });
  });

  test('clamps rules outside the safety bounds and says so', async () => {
    const { service } = setup();
    const minutes = [...GOOD];
    minutes[1] = 300;
    service.answers = [
      {
        object: answer(minutes, 'RUNNING', [
          { rule: 'growthPercent', value: 60, reason: 'Aggressive' },
          { rule: 'maxLoadingWeeks', value: 1.4, reason: '1+1' },
          { rule: 'unknownRule', value: 3, reason: 'x' },
        ]),
        raw: '',
      },
      { object: answer(GOOD), raw: '' },
    ];
    const draft = await service.generate(request);
    // The repair round sees the clamped rules: 20%, not 60%.
    const revision = service.prompts[1].revision as {
      rules: Record<string, number>;
      problems: string[];
    };
    expect(revision.rules).toMatchObject({
      growthPercent: 20,
      maxLoadingWeeks: 2,
    });
    expect(revision.problems.join('\n')).toMatch(/week 2: 300 minutes/);
    // The repaired answer kept the defaults.
    expect(draft.rules).toEqual(DEFAULT_AI_PLAN_RULES);
  });
});

describe('applyAiPlanRules', () => {
  test('rounds, clamps and reports the value asked for', () => {
    const { rules, notes } = applyAiPlanRules([
      { rule: 'growthPercent', value: 60, reason: '  big  ' },
      { rule: 'taperLastWeekPercent', value: 10, reason: '' },
      { rule: 'injuryMaxRpe', value: 5.4, reason: 'knee' },
      { rule: 'hoursAllowancePercent', value: Number.NaN, reason: 'x' },
    ]);
    expect(rules).toMatchObject({
      growthPercent: 20,
      taperLastWeekPercent: 40,
      injuryMaxRpe: 5,
      hoursAllowancePercent: 10,
    });
    expect(notes.find((note) => note.rule === 'growthPercent')).toEqual({
      rule: 'growthPercent',
      source: 'ai',
      reason: 'big',
      requested: 60,
    });
    expect(notes.find((note) => note.rule === 'taperLastWeekPercent')).toEqual({
      rule: 'taperLastWeekPercent',
      source: 'ai',
      requested: 10,
    });
    expect(notes.find((note) => note.rule === 'injuryMaxRpe')?.requested).toBe(
      5.4,
    );
    expect(
      notes.find((note) => note.rule === 'hoursAllowancePercent')?.requested,
    ).toBeNaN();
    expect(notes.find((note) => note.rule === 'growthMinutes')).toEqual({
      rule: 'growthMinutes',
      source: 'default',
    });
  });

  test('keeps every default within its own bounds', () => {
    for (const key of AI_PLAN_RULE_KEYS) {
      const { min, max } = AI_PLAN_RULES[key];
      expect(DEFAULT_AI_PLAN_RULES[key]).toBeGreaterThanOrEqual(min);
      expect(DEFAULT_AI_PLAN_RULES[key]).toBeLessThanOrEqual(max);
    }
  });
});

describe('PlanGenerationService race context', () => {
  type Prompt = {
    request: { goal: unknown };
    athlete: { races: Array<Record<string, unknown>> };
  };

  test('flags the calendar goal once and sends the other races in full', async () => {
    const { service } = setup();
    service.answers = [{ object: answer(GOOD), raw: '' }];
    await service.generate({ ...request, goalEventId: 50 });
    const sent = (service.prompts[0] as Prompt).athlete.races;
    expect(sent).toEqual([
      {
        name: 'Tune-up 5K',
        date: '2030-11-16T09:00:00.000Z',
        dayInPlan: 26,
        sport: 'RUNNING',
        distance: 5000,
        elevationGain: null,
        timeTarget: 1200,
        description: `Hilly. ${'x'.repeat(293)}`,
        priority: 'PREPARATORY',
        goal: false,
      },
      {
        name: '10K',
        date: '2030-12-14T08:00:00.000Z',
        dayInPlan: 54,
        sport: 'RUNNING',
        distance: 10000,
        elevationGain: 20,
        timeTarget: 2700,
        description: 'Flat and fast',
        priority: null,
        goal: true,
      },
    ]);
  });

  test('recognizes a typed goal already in the calendar, by name and day', async () => {
    const { service } = setup();
    service.answers = [
      { object: answer(GOOD), raw: '' },
      { object: answer(GOOD), raw: '' },
    ];
    await service.generate({
      ...request,
      goal: { ...request.goal, name: ' 10k ' },
    });
    expect(
      (service.prompts[0] as Prompt).athlete.races.map((race) => race.goal),
    ).toEqual([false, true]);
    // Another name on the same day, or the same name another day, is
    // another race.
    await service.generate({
      ...request,
      goal: { ...request.goal, name: 'Marathon' },
    });
    expect(
      (service.prompts[1] as Prompt).athlete.races.map((race) => race.goal),
    ).toEqual([false, false]);
    service.answers = [{ object: answer(GOOD), raw: '' }];
    await service.generate({
      ...request,
      goal: { ...request.goal, name: 'Tune-up 5K' },
    });
    expect(
      (service.prompts[2] as Prompt).athlete.races.map((race) => race.goal),
    ).toEqual([false, false]);
  });

  test('takes a goal from the calendar only if it is a race of that athlete', async () => {
    const { service, queue } = setup();
    await expect(
      service.start(coach, { ...request, goalEventId: 60 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.start(coach, { ...request, goalEventId: 404 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.start(coach, { ...request, goalEventId: 61 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queue.add).not.toHaveBeenCalled();
    await expect(
      service.start(coach, { ...request, goalEventId: 50 }),
    ).resolves.toMatchObject({ state: 'queued' });
  });

  test('the form shows exactly what a draft sends', async () => {
    const { service } = setup();
    service.answers = [{ object: answer(GOOD), raw: '' }];
    const draft = await service.generate({ ...request, goalEventId: 50 });
    const preview = await service.previewContext(coach, {
      athleteId: 4,
      goalEventId: 50,
      startDate: request.startDate,
      raceDate: request.goal.date,
      timeZone: request.timeZone,
    });
    expect(preview.athlete).toEqual(
      (service.prompts[0] as { athlete: unknown }).athlete,
    );
    expect(preview.conflicts).toEqual(draft.conflicts);
    expect(preview.zoneTypes).toEqual(['HEARTRATE']);
  });

  test('lists upcoming calendar races with their goals', async () => {
    const { service, prisma } = setup();
    await expect(service.upcomingRaces(coach, 4)).resolves.toEqual([
      {
        eventId: 51,
        name: 'Tune-up 5K',
        startDate: '2030-11-16T09:00:00.000Z',
        sport: 'RUNNING',
        distance: 5000,
        elevationGain: null,
        timeTarget: 1200,
      },
      {
        eventId: 50,
        name: '10K',
        startDate: '2030-12-14T08:00:00.000Z',
        sport: 'RUNNING',
        distance: 10000,
        elevationGain: 20,
        timeTarget: 2700,
      },
    ]);
    const where = prisma.event.findMany.mock.calls.at(-1)![0].where as {
      type: string;
      startDate: { gte: Date; lt: Date };
    };
    expect(where.type).toBe('COMPETITION');
    // From today, about a year ahead.
    expect(where.startDate.lt.getTime() - NOW.getTime()).toBeGreaterThan(
      360 * 86400000,
    );
    prisma.coachAthlete.findFirst.mockResolvedValue(null);
    await expect(service.upcomingRaces(coach, 4)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('PlanGenerationService model call', () => {
  // The real call, with the agent replaced.
  const generate = planGenerationAgent.generate as jest.Mock;
  const real = () =>
    new PlanGenerationService(
      null as never,
      null as never,
      null as never,
    ) as unknown as {
      callModel: (prompt: string) => Promise<{
        object: unknown;
        raw: string;
        truncated?: boolean;
      }>;
    };
  beforeEach(() => generate.mockReset());

  test('asks for a structured plan with room for the longest one', async () => {
    generate.mockResolvedValue({
      // Whole minutes, as the output schema requires
      object: answer([180, 120]),
      text: '{}',
      finishReason: 'stop',
    });
    const result = await real().callModel('{}');
    expect(result.truncated).toBe(false);
    expect(result.object).not.toBeNull();
    expect(generate.mock.calls[0][1]).toMatchObject({
      modelSettings: { maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS },
    });
    // 24 weeks of 7 sessions (~12k tokens) plus thinking.
    expect(PLAN_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(48_000);
  });

  test('notices an answer cut by the output limit', async () => {
    generate.mockResolvedValueOnce({
      object: null,
      text: '{"rules":[],"name":"P',
      finishReason: 'length',
    });
    await expect(real().callModel('{}')).resolves.toMatchObject({
      object: null,
      truncated: true,
    });
    generate.mockRejectedValueOnce(
      new Error(
        'Structured output was truncated because the model finished with reason "length".',
      ),
    );
    await expect(real().callModel('{}')).resolves.toMatchObject({
      object: null,
      truncated: true,
    });
  });

  test('does not call again when the account has no credit', async () => {
    generate.mockRejectedValue(
      Object.assign(new Error('You have no credits remaining.'), {
        name: 'AI_APICallError',
        statusCode: 429,
        data: { error: { code: 'insufficient_quota' } },
      }),
    );
    await expect(real().callModel('{}')).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('PlanGenerationService jobs', () => {
  test('queues a draft only for a linked athlete', async () => {
    const { service, prisma, queue } = setup();
    await expect(service.start(coach, request)).resolves.toEqual({
      jobId: 'job-1',
      state: 'queued',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'generate',
      { userId: 3, request },
      { jobId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    );
    prisma.coachAthlete.findFirst.mockResolvedValue(null);
    queue.add.mockClear();
    await expect(service.start(coach, request)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  test('shows a draft only to whoever asked for it', async () => {
    const { service, queue } = setup();
    const job = (state: string, extra = {}) => ({
      data: { userId: 3, request },
      getState: jest.fn().mockResolvedValue(state),
      ...extra,
    });
    queue.getJob.mockResolvedValue(
      job('completed', { returnvalue: { plan: null } }),
    );
    await expect(service.status(coach, 'a')).resolves.toEqual({
      jobId: 'a',
      state: 'done',
      draft: { plan: null },
    });
    queue.getJob.mockResolvedValue(
      job('active', { progress: { stage: 'repairing' } }),
    );
    await expect(service.status(coach, 'a')).resolves.toMatchObject({
      state: 'running',
      stage: 'repairing',
    });
    queue.getJob.mockResolvedValue(job('waiting'));
    await expect(service.status(coach, 'a')).resolves.toMatchObject({
      state: 'queued',
    });
    queue.getJob.mockResolvedValue(
      job('failed', {
        failedReason:
          'AI_PLAN_FAILED {"reason":"QUOTA","detail":"429 insufficient_quota"}',
      }),
    );
    await expect(service.status(coach, 'a')).resolves.toEqual({
      jobId: 'a',
      state: 'failed',
      reason: 'QUOTA',
      detail: '429 insufficient_quota',
    });
    // A failure the worker did not classify, such as a stalled job.
    queue.getJob.mockResolvedValue(
      job('failed', { failedReason: 'job stalled more than allowable limit' }),
    );
    await expect(service.status(coach, 'a')).resolves.toEqual({
      jobId: 'a',
      state: 'failed',
      reason: 'PROVIDER_ERROR',
    });
    queue.getJob.mockResolvedValue({
      ...job('completed'),
      data: { userId: 99 },
    });
    await expect(service.status(coach, 'a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    queue.getJob.mockResolvedValue(undefined);
    await expect(service.status(coach, 'a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('PlanGenerationService.weekSteps', () => {
  test('structures each session, three at a time, and never fails the week', async () => {
    const { service, parser } = setup();
    let running = 0;
    let most = 0;
    parser.parse.mockImplementation(async ({ text }: { text: string }) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      if (text === 'broken') throw new Error('provider');
      if (text === 'empty') return [];
      return [{ stepType: 'STEADY', durationType: 'TIME', durationValue: 600 }];
    });
    const texts = ['a', 'broken', 'empty', 'b', 'c', 'd'];
    const result = await service.weekSteps(coach, {
      athleteId: 4,
      sessions: texts.map((text) => ({ sport: SPORT_TYPE.RUNNING, text })),
    });
    expect(result.steps.map((steps) => (steps ? steps.length : null))).toEqual([
      1,
      null,
      null,
      1,
      1,
      1,
    ]);
    expect(most).toBe(3);
    expect(parser.parse).toHaveBeenCalledWith({
      text: 'a',
      sport: 'RUNNING',
      athleteId: 4,
    });
  });

  test('refuses athletes the coach is not linked to', async () => {
    const { service, prisma, parser } = setup();
    prisma.coachAthlete.findFirst.mockResolvedValue(null);
    await expect(
      service.weekSteps(coach, {
        athleteId: 4,
        sessions: [{ sport: SPORT_TYPE.RUNNING, text: 'a' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(parser.parse).not.toHaveBeenCalled();
  });
});
