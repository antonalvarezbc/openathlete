import { BadRequestException, NotFoundException } from '@nestjs/common';

import { Prisma } from '@openathlete/database';

import { buildActivityAnalysisContext } from './activity-analysis-context';

const start = new Date('2026-09-20T10:00:00.000Z');
const end = new Date('2026-09-20T11:00:00.000Z');
const step = {
  stepType: 'STEADY',
  name: 'Easy run',
  notes: 'Stay comfortable',
  durationType: 'TIME',
  durationValue: 3600,
  durationTarget: null,
  targets: [
    {
      targetType: 'RPE',
      targetMin: null,
      targetMax: null,
      targetValue: 4,
      metricType: null,
    },
  ],
  repeatBlock: null,
};
function setup() {
  const planned = {
    sport: 'RUNNING',
    description: 'Run/walk on flat terrain',
    goalDuration: 3600,
    goalDistance: null,
    goalElevationGain: 0,
    goalRpe: 0.4,
    estimatedLoad: 180,
    workout: { steps: [step] },
    event: {
      name: 'Easy planned session',
      startDate: start,
      endDate: end,
      trainingWeek: { cycle: { trainingPlanId: 8 } },
    },
  };
  const activity = {
    eventActivityId: 55,
    sport: 'RUNNING',
    description: 'Legs felt good',
    distance: 8200,
    movingTime: 3900,
    elevationGain: 150,
    averageHeartrate: 145,
    maxHeartrate: 165,
    rpe: 0.65,
    trainingLoadEntries: [
      {
        date: new Date('2026-09-20'),
        value: 422.5,
        calculation: { type: 'FOSTER_RPE' },
      },
      {
        date: new Date('2026-09-20'),
        value: 89,
        calculation: { type: 'TRIMP' },
      },
    ],
    averageSpeed: 2.1,
    maxSpeed: 4,
    averageCadence: null,
    averageWatts: null,
    maxWatts: null,
    weightedAverageWatts: null,
    averageGapSpeed: null,
    averageNormalizedSpeed: null,
    kilojoules: null,
    feedbackSkipped: false,
    feedbackQuestions: [
      {
        questionText: 'How did it feel?',
        answerText: 'Comfortable',
        updatedAt: end,
      },
    ],
    relatedTraining: planned,
    relatedCompetition: null,
    // Extra fields must never escape even if a future query accidentally includes them.
    externalId: 'private-provider-identifier',
    stream: { latlng: [[1, 2]] },
    messageThread: { messages: [{ content: 'private-thread-message' }] },
  };
  const event = {
    type: 'ACTIVITY',
    athleteId: 4,
    name: 'Trail run',
    startDate: start,
    endDate: end,
    trainingWeek: null,
    activity,
  };
  const db = {
    event: {
      findUnique: jest.fn().mockResolvedValue(event),
      findMany: jest.fn().mockResolvedValue([]),
    },
    athleteMetric: { findMany: jest.fn().mockResolvedValue([]) },
    athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
    trainingPlan: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const build = () =>
    buildActivityAnalysisContext(
      db as unknown as Prisma.TransactionClient,
      7,
      'Focus on pacing',
      'es',
    );
  return { build, db, event, activity, planned };
}

test('provides planned vs actual summary with normalized RPE and explicit units', async () => {
  const { build } = setup();
  const result = await build();
  expect(result.activity).toMatchObject({
    durationSeconds: 3900,
    distanceMeters: 8200,
    elevationGainMeters: 150,
    rpe0To10: 6.5,
    averageHeartRateBpm: 145,
    averagePowerWatts: null,
    description: 'Legs felt good',
    answeredFeedback: [{ answer: 'Comfortable' }],
  });
  expect(result.plannedSession).toMatchObject({
    description: 'Run/walk on flat terrain',
    durationSeconds: 3600,
    distanceMeters: null,
    elevationGainMeters: 0,
    rpe0To10: 4,
    workout: {
      steps: [
        { durationType: 'TIME', durationValue: 3600, targets: [{ value: 4 }] },
      ],
    },
  });
  expect(result.activity.load.map((load) => load.method)).toEqual([
    'FOSTER_RPE',
    'TRIMP',
  ]);
  expect(result.language).toBe('es');
  expect(result.coachContext).toBe('Focus on pacing');
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});

test('does not select or forward account identifiers, streams or private conversations', async () => {
  const { build, db } = setup();
  const result = await build();
  const serialized = JSON.stringify(result);
  for (const value of [
    'private-provider-identifier',
    'private-thread-message',
    'latlng',
    'athleteId',
    'eventActivityId',
  ]) {
    expect(serialized).not.toContain(value);
  }
  const select = db.event.findUnique.mock.calls[0][0].select.activity.select;
  expect(select).not.toHaveProperty('stream');
  expect(select).not.toHaveProperty('externalId');
  expect(select).not.toHaveProperty('messageThread');
  expect(select).not.toHaveProperty('providerAccount');
  expect(result.exclusions).toContain(
    'Private conversations and activity message-thread comments',
  );
});

test('uses the selected activity date rather than today and excludes unfinished/later activities', async () => {
  const { build, db, activity } = setup();
  db.event.findMany.mockResolvedValue([
    {
      startDate: new Date('2026-09-19T10:00:00Z'),
      endDate: new Date('2026-09-19T11:00:00Z'),
      activity,
    },
  ]);
  const result = await build();
  expect(db.event.findMany.mock.calls[0][0].where).toEqual({
    athleteId: 4,
    type: 'ACTIVITY',
    eventId: { not: 7 },
    startDate: { gte: new Date('2026-08-23T10:00:00Z'), lt: start },
    endDate: { lte: start },
  });
  expect(result.history).toMatchObject({
    from: '2026-08-23T10:00:00.000Z',
    before: start.toISOString(),
    windowDays: 28,
    activities: [
      { startDate: '2026-09-19T10:00:00.000Z', summary: { rpe0To10: 6.5 } },
    ],
  });
});

test('includes date-only overnight values on activity day but restricts daily aggregates to prior days', async () => {
  const { build, db } = setup();
  db.athleteMetric.findMany.mockResolvedValue([
    { type: 'HRV_LAST_NIGHT_AVG', value: 43, date: new Date('2026-09-20') },
    { type: 'SLEEP_DURATION', value: 6.87, date: new Date('2026-09-20') },
    { type: 'HR_REST', value: 60, date: new Date('2026-09-19') },
  ]);
  const result = await build();
  const { where } = db.athleteMetric.findMany.mock.calls[0][0];
  expect(where.date).toEqual({ gte: new Date('2026-08-23') });
  expect(where.OR[0].date).toEqual({ lt: new Date('2026-09-20') });
  expect(where.OR[1].date).toEqual(new Date('2026-09-20'));
  expect(where.OR[1].type.in).toContain('HRV_LAST_NIGHT_AVG');
  for (const type of [
    'HR_REST',
    'STRESS_AVERAGE',
    'BODY_BATTERY_DRAINED',
    'RMSSD',
  ]) {
    expect(where.OR[1].type.in).not.toContain(type);
  }
  expect(result.wellness.metrics).toEqual([
    { type: 'HRV_LAST_NIGHT_AVG', value: 43, unit: 'ms', date: '2026-09-20' },
    { type: 'SLEEP_DURATION', value: 6.87, unit: 'h', date: '2026-09-20' },
    { type: 'HR_REST', value: 60, unit: 'bpm', date: '2026-09-19' },
  ]);
  expect(result.wellness.missingTypes).toContain('STRESS_AVERAGE');
  expect(result.wellness.missingTypes).not.toContain('HR_REST');
});

test('preserves unknown versus zero and rejects invalid RPE instead of inventing a value', async () => {
  const { build, activity, planned } = setup();
  Object.assign(activity, {
    rpe: null,
    averageHeartrate: null,
    elevationGain: 0,
  });
  Object.assign(planned, { goalRpe: null, goalDuration: null });
  let result = await build();
  expect(result.activity.rpe0To10).toBeNull();
  expect(result.activity.averageHeartRateBpm).toBeNull();
  expect(result.activity.elevationGainMeters).toBe(0);
  expect(result.plannedSession?.durationSeconds).toBeNull();
  for (const invalid of [-0.1, 6, Number.NaN, Infinity]) {
    activity.rpe = invalid;
    result = await build();
    expect(result.activity.rpe0To10).toBeNull();
  }
  activity.rpe = 0;
  expect((await build()).activity.rpe0To10).toBe(0);
});

test('bounds feedback, text, historical activities and wellness and announces truncation', async () => {
  const { db, activity } = setup();
  activity.description = 'a'.repeat(9000);
  activity.feedbackQuestions = Array.from({ length: 11 }, () => ({
    questionText: 'q'.repeat(1000),
    answerText: 'a'.repeat(3000),
    updatedAt: end,
  }));
  db.event.findMany.mockResolvedValue(
    Array.from({ length: 61 }, () => ({
      startDate: start,
      endDate: end,
      activity,
    })),
  );
  db.athleteMetric.findMany.mockResolvedValue(
    Array.from({ length: 121 }, () => ({
      type: 'HR_REST',
      value: 60,
      date: new Date('2026-09-19'),
    })),
  );
  const result = await buildActivityAnalysisContext(
    db as unknown as Prisma.TransactionClient,
    7,
    'x'.repeat(9000),
    'es',
  );
  expect(result.coachContext).toHaveLength(5000);
  expect(result.activity.description).toHaveLength(3000);
  expect(result.activity.answeredFeedback).toHaveLength(10);
  expect(result.activity.answeredFeedback[0].question).toHaveLength(500);
  expect(result.activity.answeredFeedback[0].answer).toHaveLength(1500);
  expect(result.activity.feedbackTruncated).toBe(true);
  expect(result.history.activities).toHaveLength(60);
  expect(result.history.truncated).toBe(true);
  expect(result.wellness.metrics).toHaveLength(120);
  expect(result.wellness.truncated).toBe(true);
  expect(db.event.findMany.mock.calls[0][0].take).toBe(61);
  expect(db.athleteMetric.findMany.mock.calls[0][0].take).toBe(121);
});

test('bounds the total structured steps including repeated children', async () => {
  const { build, planned } = setup();
  Object.assign(planned.workout, {
    steps: Array.from({ length: 61 }, () => ({
      ...step,
      repeatBlock: {
        repetitions: 3,
        childSteps: Array.from({ length: 61 }, () => step),
      },
    })),
  });
  const result = await build();
  const structured = result.plannedSession?.workout;
  expect(structured?.truncated).toBe(true);
  expect(
    structured?.steps.reduce(
      (n, item) => n + 1 + (item.repeatBlock?.childSteps.length ?? 0),
      0,
    ),
  ).toBe(60);
});

test('limits goals to linked plans owned by the athlete and includes objective/preparation races', async () => {
  const { build, db } = setup();
  db.trainingPlan.findMany.mockResolvedValue([
    {
      name: 'Trail plan',
      description: 'Autumn preparation',
      goal: 'Finish strong',
      startDate: start,
      endDate: end,
      status: 'ACTIVE',
      races: [
        {
          priority: 'TARGET',
          competition: {
            sport: 'TRAIL_RUNNING',
            description: 'Mountain marathon',
            goalDuration: null,
            goalDistance: 42000,
            goalElevationGain: 1500,
            goalRpe: null,
            event: { name: 'Target race', startDate: new Date('2026-10-20') },
          },
        },
      ],
    },
  ]);
  const result = await build();
  expect(db.trainingPlan.findMany.mock.calls[0][0].where).toEqual({
    athleteId: 4,
    trainingPlanId: { in: [8] },
  });
  expect(result.linkedPlans[0]).toMatchObject({
    goal: 'Finish strong',
    races: [{ priority: 'TARGET', distanceMeters: 42000 }],
  });
});

test('works without a linked plan or prescription and does not guess goals', async () => {
  const { build, db, activity } = setup();
  Object.assign(activity, { relatedTraining: null });
  const result = await build();
  expect(result.plannedSession).toBeNull();
  expect(result.linkedPlans).toEqual([]);
  expect(db.trainingPlan.findMany).not.toHaveBeenCalled();
});

test('rejects missing or non-activity events before querying athlete context', async () => {
  const { build, db, event } = setup();
  db.event.findUnique.mockResolvedValue(null);
  await expect(build()).rejects.toBeInstanceOf(NotFoundException);
  db.event.findUnique.mockResolvedValue({ ...event, type: 'TRAINING' });
  await expect(build()).rejects.toBeInstanceOf(BadRequestException);
  expect(db.event.findMany).not.toHaveBeenCalled();
  expect(db.athleteMetric.findMany).not.toHaveBeenCalled();
});

test('normalizes active injury pain and limits injury context to activity-related records', async () => {
  const { build, db } = setup();
  db.athleteInjury.findMany.mockResolvedValue([
    {
      location: 'Calf',
      painScore: 0.3,
      context: 'After running',
      status: 'STABLE',
      createdAt: end,
      updatedAt: end,
    },
  ]);
  const result = await build();
  expect(result.relevantActiveInjuries).toEqual([
    {
      location: 'Calf',
      pain0To10: 3,
      context: 'After running',
      status: 'STABLE',
      recordedAt: end.toISOString(),
      lastUpdatedAt: end.toISOString(),
    },
  ]);
  expect(db.athleteInjury.findMany.mock.calls[0][0].where).toEqual({
    athleteId: 4,
    status: { not: 'RESOLVED' },
    OR: [{ createdAt: { lte: end } }, { sourceActivityId: 55 }],
  });
});

test('recognizes linked competition prescriptions without a structured workout', async () => {
  const { build, activity, planned, db } = setup();
  Object.assign(activity, {
    relatedTraining: null,
    relatedCompetition: { ...planned, planRaces: [{ trainingPlanId: 9 }] },
  });
  const result = await build();
  expect(result.plannedSession).toMatchObject({
    type: 'COMPETITION',
    description: planned.description,
    rpe0To10: 4,
    workout: null,
    estimatedLoad: null,
  });
  expect(
    db.trainingPlan.findMany.mock.calls[0][0].where.trainingPlanId.in,
  ).toContain(9);
});
