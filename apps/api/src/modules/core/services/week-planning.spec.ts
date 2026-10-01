import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { EventService } from './event.service';
import { WeekPlanningService } from './week-planning.service';

jest.mock('./event.service', () => ({ EventService: class {} }));
jest.mock('src/modules/auth', () => ({ CaslAbilityFactory: class {} }));

const coach = {
  userId: 3,
  roles: ['COACH'],
  coachAthletes: [{ athleteId: 7 }],
} as unknown as AuthUser;
const monday = new Date('2026-10-05T00:00:00.000Z');
const tuesday = new Date('2026-10-06T08:00:00.000Z');
const tuesdayEnd = new Date('2026-10-06T09:00:00.000Z');

function planWeek(overrides: Record<string, unknown> = {}) {
  return {
    trainingWeekId: 11,
    weekNumber: 4,
    startDate: monday,
    endDate: new Date('2026-10-11T23:59:59.000Z'),
    theme: 'Threshold',
    targetVolume: 36000,
    targetLoad: 420,
    cycle: {
      cycleId: 2,
      name: 'Build',
      phase: 'SPECIFIC',
      color: '#3366ff',
      trainingPlan: {
        trainingPlanId: 9,
        name: 'Marathon',
        status: 'ACTIVE',
        races: [
          {
            priority: 'PREPARATORY',
            competition: {
              event: {
                eventId: 50,
                name: '10K',
                startDate: new Date('2026-10-11T09:00:00.000Z'),
              },
            },
          },
          {
            priority: 'TARGET',
            competition: {
              event: {
                eventId: 51,
                name: 'Marathon',
                startDate: new Date('2026-11-29T09:00:00.000Z'),
              },
            },
          },
        ],
      },
    },
    ...overrides,
  };
}

function setup() {
  const db = {
    athlete: {
      findUnique: jest.fn().mockResolvedValue({ athleteId: 7, userId: 4 }),
      findFirst: jest.fn().mockResolvedValue({ athleteId: 7 }),
    },
    trainingWeek: {
      findMany: jest.fn().mockResolvedValue([planWeek()]),
      count: jest.fn().mockResolvedValue(16),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ trainingWeekId: 12 }),
      update: jest.fn().mockResolvedValue({ trainingWeekId: 11 }),
    },
    trainingPlan: {
      findFirst: jest.fn().mockResolvedValue({
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-12-31'),
      }),
    },
    trainingLoadCalculation: {
      findUnique: jest.fn().mockResolvedValue({ trainingLoadCalculationId: 1 }),
    },
    trainingLoadEntry: {
      findMany: jest.fn().mockResolvedValue([
        { value: 85.5, activity: { eventId: 30 } },
        { value: 40, activity: { eventId: 31 } },
      ]),
    },
    event: { findUnique: jest.fn(), update: jest.fn() },
  };
  const ability = { can: jest.fn().mockReturnValue(true) };
  const abilities = { getFor: jest.fn().mockResolvedValue(ability) };
  const events = {
    duplicateEventComplete: jest.fn().mockResolvedValue({ eventId: 99 }),
    updateEvent: jest.fn().mockResolvedValue({}),
    deleteEvent: jest.fn().mockResolvedValue({}),
  };
  const service = new WeekPlanningService(
    db as unknown as PrismaService,
    abilities as unknown as CaslAbilityFactory,
    events as unknown as EventService,
  );
  return { db, ability, events, service };
}

beforeEach(() => jest.clearAllMocks());

describe('week overview', () => {
  it('returns plan context, races in the week and actual load per activity', async () => {
    const { service } = setup();
    const overview = await service.overview(coach, monday, 7);
    expect(overview.planWeek).toMatchObject({
      trainingWeekId: 11,
      weekNumber: 4,
      theme: 'Threshold',
      targetLoad: 420,
      cycle: { name: 'Build', phase: 'SPECIFIC' },
      plan: { trainingPlanId: 9, name: 'Marathon', weekCount: 16 },
      races: [{ eventId: 50, priority: 'PREPARATORY' }],
    });
    expect(overview.activityLoads).toEqual({ 30: 85.5, 31: 40 });
  });

  it('prefers the week with most overlap, then active plans', async () => {
    const { service, db } = setup();
    const draft = planWeek({ trainingWeekId: 20 });
    (draft.cycle.trainingPlan as { status: string }).status = 'DRAFT';
    const partial = planWeek({
      trainingWeekId: 21,
      startDate: new Date('2026-10-10T00:00:00.000Z'),
    });
    db.trainingWeek.findMany.mockResolvedValue([partial, draft, planWeek()]);
    const overview = await service.overview(coach, monday, 7);
    expect(overview.planWeek?.trainingWeekId).toBe(11);
  });

  it('has no plan context outside any plan week', async () => {
    const { service, db } = setup();
    db.trainingWeek.findMany.mockResolvedValue([]);
    const overview = await service.overview(coach, monday, 7);
    expect(overview.planWeek).toBeNull();
  });

  it('rejects athletes the user cannot read', async () => {
    const { service, ability } = setup();
    ability.can.mockReturnValue(false);
    await expect(service.overview(coach, monday, 7)).rejects.toThrow(
      'Not allowed to access this athlete',
    );
  });
});

describe('week targets', () => {
  it('lets the coach edit theme and targets of a linked athlete plan', async () => {
    const { service, db } = setup();
    db.trainingWeek.findUnique.mockResolvedValue({
      cycle: { trainingPlan: { athleteId: 7, status: 'ACTIVE' } },
    });
    (db.athlete.findFirst as jest.Mock).mockResolvedValue({ athleteId: 7 });
    await service.updateWeek(coach, 11, { targetLoad: 450, theme: null });
    expect(db.trainingWeek.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trainingWeekId: 11 },
        data: { targetLoad: 450, theme: null },
      }),
    );
  });

  it('refuses archived plans and unknown weeks', async () => {
    const { service, db } = setup();
    db.trainingWeek.findUnique.mockResolvedValue({
      cycle: { trainingPlan: { athleteId: 7, status: 'ARCHIVED' } },
    });
    await expect(service.updateWeek(coach, 11, {})).rejects.toThrow(
      BadRequestException,
    );
    db.trainingWeek.findUnique.mockResolvedValue(null);
    await expect(service.updateWeek(coach, 11, {})).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('batch actions', () => {
  const item = { eventId: 5, startDate: tuesday, endDate: tuesdayEnd };

  it('copies sessions to the new dates and keeps them in the plan', async () => {
    const { service, db, events } = setup();
    db.event.findUnique.mockResolvedValue({
      type: 'TRAINING',
      athleteId: 7,
      training: { relatedActivityId: 40 },
      trainingWeek: { cycle: { trainingPlanId: 9 } },
    });
    const result = await service.copy(coach, { items: [item] });
    expect(events.duplicateEventComplete).toHaveBeenCalledWith(coach, 5, {
      startDate: tuesday,
      endDate: tuesdayEnd,
    });
    expect(db.event.update).toHaveBeenCalledWith({
      where: { eventId: 99 },
      data: { trainingWeekId: 12 },
    });
    expect(result).toEqual({ succeeded: [99], failed: [] });
  });

  it('keeps copies outside the plan as plain sessions', async () => {
    const { service, db } = setup();
    db.event.findUnique.mockResolvedValue({
      type: 'NOTE',
      athleteId: 7,
      training: null,
      trainingWeek: null,
    });
    db.trainingPlan.findFirst.mockResolvedValue(null);
    const result = await service.copy(coach, {
      items: [item],
      trainingPlanId: 9,
    });
    expect(db.event.update).not.toHaveBeenCalled();
    expect(result.succeeded).toEqual([99]);
  });

  it('never copies, moves or deletes activities and races', async () => {
    const { service, db, events } = setup();
    for (const type of ['ACTIVITY', 'COMPETITION']) {
      db.event.findUnique.mockResolvedValue({ type, athleteId: 7 });
      const copy = await service.copy(coach, { items: [item] });
      const move = await service.move(coach, { items: [item] });
      const del = await service.delete(coach, { eventIds: [5] });
      for (const result of [copy, move, del])
        expect(result.failed).toHaveLength(1);
    }
    expect(events.duplicateEventComplete).not.toHaveBeenCalled();
    expect(events.updateEvent).not.toHaveBeenCalled();
    expect(events.deleteEvent).not.toHaveBeenCalled();
  });

  it('does not move or delete sessions already done', async () => {
    const { service, db, events } = setup();
    db.event.findUnique.mockResolvedValue({
      type: 'TRAINING',
      athleteId: 7,
      training: { relatedActivityId: 40 },
    });
    await service.move(coach, { items: [item] });
    await service.delete(coach, { eventIds: [5] });
    expect(events.updateEvent).not.toHaveBeenCalled();
    expect(events.deleteEvent).not.toHaveBeenCalled();
  });

  it('reports per-event failures without stopping the batch', async () => {
    const { service, db, events } = setup();
    db.event.findUnique.mockResolvedValue({
      type: 'TRAINING',
      athleteId: 7,
      training: { relatedActivityId: null },
    });
    events.updateEvent
      .mockRejectedValueOnce(
        new BadRequestException('Session must be inside an editable plan'),
      )
      .mockResolvedValueOnce({});
    const result = await service.move(coach, {
      items: [item, { ...item, eventId: 6 }],
    });
    expect(result).toEqual({
      succeeded: [6],
      failed: [
        { eventId: 5, message: 'Session must be inside an editable plan' },
      ],
    });
  });

  it('hides unexpected error details', async () => {
    const { service, db, events } = setup();
    db.event.findUnique.mockResolvedValue({
      type: 'NOTE',
      athleteId: 7,
    });
    events.deleteEvent.mockRejectedValue(new Error('connection refused'));
    const result = await service.delete(coach, { eventIds: [5] });
    expect(result.failed).toEqual([
      { eventId: 5, message: 'Unexpected error' },
    ]);
  });
});
