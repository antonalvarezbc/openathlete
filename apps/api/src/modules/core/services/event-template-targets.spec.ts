import { BadRequestException, ForbiddenException } from '@nestjs/common';

import {
  METRIC_TYPE,
  SPORT_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
} from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import { EventTemplateService } from './event-template.service';
import { EventService } from './event.service';

jest.mock('./event.service', () => ({ EventService: jest.fn() }));
jest.mock('../../queue/services/training-load-estimation.service', () => ({
  TrainingLoadEstimationService: jest.fn(),
}));

const coach: AuthUser = {
  userId: 1,
  email: 'coach@example.test',
  roles: ['COACH'],
  athlete: null,
};
const percent = {
  targetType: WORKOUT_TARGET_TYPE.HEARTRATE,
  metricType: METRIC_TYPE.HR_MAX,
  targetMin: 0.8,
  targetMax: 0.85,
  targetValue: null,
};
const targetZone = {
  targetType: WORKOUT_TARGET_TYPE.ZONE,
  targetValue: null,
  zoneReference: { type: 'HEARTRATE', name: 'Zone 4' },
};
const steps = (target: object) => [
  {
    workoutStepId: 5,
    orderIndex: 0,
    stepType: WORKOUT_STEP_TYPE.REPEAT,
    durationType: WORKOUT_DURATION_TYPE.OPEN,
    targets: [],
    repeatBlock: {
      repetitions: 5,
      childSteps: [
        {
          workoutStepId: 6,
          orderIndex: 0,
          stepType: WORKOUT_STEP_TYPE.STEADY,
          durationType: WORKOUT_DURATION_TYPE.TIME,
          durationValue: 480,
          targets: [target],
        },
      ],
    },
  },
];
const dates = {
  startDate: new Date('2026-01-01T10:00:00Z'),
  endDate: new Date('2026-01-01T11:00:00Z'),
};

function setup(target: object = percent) {
  const workout = { workoutId: 1, eventTrainingId: 1, steps: steps(target) };
  const event = {
    eventId: 10,
    athleteId: null,
    type: 'TRAINING',
    name: '5 x 8',
    ...dates,
    training: { eventTrainingId: 1, sport: SPORT_TYPE.RUNNING, workout },
  };
  const db = {
    athlete: { findFirst: jest.fn().mockResolvedValue({ athleteId: 12 }) },
    athleteMetric: {
      findMany: jest.fn().mockResolvedValue([{ type: 'HR_MAX', value: 200 }]),
    },
    trainingZone: {
      findMany: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve([
          {
            trainingZoneId: where.athleteId === 13 ? 92 : 47,
            type: 'HEARTRATE',
            name: 'Zona 4',
            values: [{ min: 144, max: 161, sports: [SPORT_TYPE.RUNNING] }],
          },
        ]),
      ),
    },
    eventTemplate: {
      findUnique: jest.fn().mockResolvedValue({ userId: 1, event }),
      create: jest.fn().mockResolvedValue({ eventTemplateId: 9 }),
    },
    event: {
      create: jest
        .fn()
        .mockResolvedValue({ ...event, eventId: 99, athleteId: 12 }),
      update: jest.fn(),
    },
    eventTraining: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ eventTrainingId: 101 }),
    },
    workout: { create: jest.fn() },
  };
  const eventService = {
    getEventById: jest.fn().mockResolvedValue({
      ...event,
      athleteId: 12,
      sport: SPORT_TYPE.RUNNING,
      workout,
    }),
    duplicateEvent: jest
      .fn()
      .mockResolvedValue({ eventId: 99, type: 'TRAINING' }),
    emitWorkoutPlannedChanged: jest.fn(),
  };
  const service = new EventTemplateService(
    db as unknown as PrismaService,
    eventService as unknown as EventService,
  );
  return { db, eventService, service };
}

function assignedTarget(db: ReturnType<typeof setup>['db']) {
  return db.event.create.mock.calls.at(-1)![0].data.training.create.workout
    .create.steps.create[0].repeatBlock.create.childSteps.create[0].targets
    .create[0];
}

describe('Reusable workout templates', () => {
  it('retains percentages inside repeated steps when saving a template', async () => {
    const { db, service } = setup();
    await service.createEventTemplate(coach, { eventId: 10 });
    const repeated =
      db.workout.create.mock.calls[0][0].data.steps.create[0].repeatBlock
        .create;
    expect(repeated.repetitions).toBe(5);
    expect(repeated.childSteps.create[0].durationValue).toBe(480);
    expect(repeated.childSteps.create[0].targets.create[0]).toEqual(percent);
  });

  it('creates event and percentage workout together, retaining the metric reference', async () => {
    const { db, service } = setup();
    await service.useEventTemplate(coach, 9, { ...dates, athleteId: 12 });
    expect(assignedTarget(db)).toEqual(percent);
    expect(db.workout.create).not.toHaveBeenCalled();
    expect(db.athleteMetric.findMany.mock.calls[0][0].where.athleteId).toBe(12);
  });

  it('maps the same portable zone to each destination athlete and leaves the template untouched', async () => {
    const { db, service } = setup(targetZone);
    await service.useEventTemplate(coach, 9, { ...dates, athleteId: 12 });
    expect(assignedTarget(db)).toMatchObject({
      targetValue: 47,
      zoneReference: targetZone.zoneReference,
    });
    await service.useEventTemplate(coach, 9, { ...dates, athleteId: 13 });
    expect(assignedTarget(db)).toMatchObject({
      targetValue: 92,
      zoneReference: targetZone.zoneReference,
    });
    await expect(
      db.eventTemplate.findUnique.mock.results[0].value,
    ).resolves.toMatchObject({
      event: { training: { workout: { steps: steps(targetZone) } } },
    });
  });

  it.each(['metric', 'zone'] as const)(
    'does not create a partial calendar event when a %s is missing',
    async (missing) => {
      const { db, service, eventService } = setup(
        missing === 'metric' ? percent : targetZone,
      );
      db.athleteMetric.findMany.mockResolvedValue([]);
      db.trainingZone.findMany.mockResolvedValue([]);
      await expect(
        service.useEventTemplate(coach, 9, { ...dates, athleteId: 12 }),
      ).rejects.toThrow(BadRequestException);
      expect(db.event.create).not.toHaveBeenCalled();
      expect(eventService.emitWorkoutPlannedChanged).not.toHaveBeenCalled();
    },
  );

  it('rejects an unlinked coach before loading athlete metrics or creating an event', async () => {
    const { db, service } = setup();
    db.athlete.findFirst.mockResolvedValue(null);
    await expect(
      service.useEventTemplate(coach, 9, { ...dates, athleteId: 12 }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.athleteMetric.findMany).not.toHaveBeenCalled();
    expect(db.event.create).not.toHaveBeenCalled();
  });

  it('does not allow athlete-only users to apply a training template', async () => {
    const { db, service } = setup();
    await expect(
      service.useEventTemplate({ ...coach, roles: ['ATHLETE'] }, 9, {
        ...dates,
        athleteId: 12,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.event.create).not.toHaveBeenCalled();
  });
  it('converts an owned legacy zone template before assigning it to another athlete', async () => {
    const { db, service } = setup({ targetType: 'ZONE', targetValue: 47 });
    await service.useEventTemplate(coach, 9, { ...dates, athleteId: 13 });
    expect(assignedTarget(db)).toMatchObject({
      targetValue: 92,
      zoneReference: { type: 'HEARTRATE', name: 'Zona 4' },
    });
  });

  it('rejects an unknown metric before passing an invalid enum to Prisma', async () => {
    const { db, service } = setup({ ...percent, metricType: 'NOT_A_METRIC' });
    await expect(
      service.useEventTemplate(coach, 9, { ...dates, athleteId: 12 }),
    ).rejects.toThrow(BadRequestException);
    expect(db.athleteMetric.findMany).not.toHaveBeenCalled();
    expect(db.event.create).not.toHaveBeenCalled();
  });

  it('does not duplicate the event when saving an invalid legacy zone template', async () => {
    const { db, service, eventService } = setup({
      targetType: 'ZONE',
      targetValue: -4,
    });
    await expect(
      service.createEventTemplate(coach, { eventId: 10 }),
    ).rejects.toThrow(BadRequestException);
    expect(eventService.duplicateEvent).not.toHaveBeenCalled();
    expect(db.eventTemplate.create).not.toHaveBeenCalled();
  });
});
