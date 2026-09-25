import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { Prisma } from '@openathlete/database';
import {
  INJURY_STATUS,
  SPORT_TYPE,
  createAthleteInjurySchema,
  createManagedPlanSchema,
  planRaceSchema,
  saveAthleteInjurySchema,
} from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
import {
  authorizePlanAthlete,
  findPlanWeek,
  validateLinkedRaceDates,
} from '../helpers/plan-access';
import { PlanWorkspaceService } from './plan-workspace.service';

const coach = { userId: 7, roles: ['COACH'] } as AuthUser;
const input = () =>
  createManagedPlanSchema.parse({
    athleteId: 4,
    name: 'Trail plan',
    goal: 'Finish the target race',
    description: '',
    startDate: '2030-10-21',
    endDate: '2030-10-30',
    timeZone: 'Europe/Madrid',
  });
const race = (overrides = {}) =>
  planRaceSchema.parse({
    name: 'Target',
    startDate: '2030-10-29T08:00:00Z',
    priority: 'TARGET',
    sport: SPORT_TYPE.TRAIL_RUNNING,
    ...overrides,
  });
function setup() {
  const plan = {
    trainingPlanId: 10,
    athleteId: 4,
    name: 'Trail plan',
    status: 'ACTIVE',
    startDate: new Date('2030-10-20T22:00:00Z'),
    endDate: new Date('2030-10-30T22:59:59.999Z'),
  };
  const db = {
    athlete: { findFirst: jest.fn().mockResolvedValue({ athleteId: 4 }) },
    trainingPlan: {
      findUnique: jest.fn().mockResolvedValue(plan),
      findFirst: jest.fn().mockResolvedValue(plan),
      create: jest.fn().mockImplementation(async (args) => args.data),
      update: jest.fn(),
    },
    trainingWeek: {
      findFirst: jest.fn().mockResolvedValue({ trainingWeekId: 11 }),
    },
    trainingPlanRace: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    event: {
      create: jest
        .fn()
        .mockResolvedValue({ competition: { eventCompetitionId: 12 } }),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async (fn) => fn(db));
  return {
    db,
    plan,
    service: new PlanWorkspaceService(db as unknown as PrismaService),
  };
}

describe('Managed plan contracts', () => {
  test.each([
    { endDate: '2030-10-20' },
    { startDate: '2030-02-30' },
    { endDate: '2033-01-01' },
    { timeZone: 'Bad/Zone' },
    { name: '   ' },
    { athleteId: -1 },
  ])('rejects invalid plan fields %j', (patch) => {
    expect(
      createManagedPlanSchema.safeParse({ ...input(), ...patch }).success,
    ).toBe(false);
  });
  test('validates normalized pain and requires zero pain for resolved injuries', () => {
    const injury = {
      location: 'Calf',
      context: 'Reported pain during running',
      status: INJURY_STATUS.STABLE,
      painScore: 0.4,
    };
    expect(
      createAthleteInjurySchema.parse({ athleteId: 4, injury }).injury
        .painScore,
    ).toBe(0.4);
    expect(
      saveAthleteInjurySchema.safeParse({ ...injury, painScore: 4 }).success,
    ).toBe(false);
    expect(
      saveAthleteInjurySchema.safeParse({
        ...injury,
        status: INJURY_STATUS.RESOLVED,
      }).success,
    ).toBe(false);
    expect(
      saveAthleteInjurySchema.safeParse({
        ...injury,
        status: INJURY_STATUS.RESOLVED,
        painScore: 0,
      }).success,
    ).toBe(true);
    expect(
      saveAthleteInjurySchema.safeParse({ ...injury, sourceActivityId: 123 })
        .success,
    ).toBe(false);
  });
});

describe('Plan ownership and persistence', () => {
  test('creates empty weeks in the chosen timezone, including DST and a partial final week', async () => {
    const { db, service } = setup();
    db.trainingPlan.findFirst.mockResolvedValue(null);
    await service.create(coach, input());
    const data = db.trainingPlan.create.mock.calls[0][0].data;
    expect(data.startDate.toISOString()).toBe('2030-10-20T22:00:00.000Z');
    expect(data.endDate.toISOString()).toBe('2030-10-30T22:59:59.999Z');
    const weeks = data.cycles.create.weeks.create;
    expect(weeks).toHaveLength(2);
    expect(weeks[0].endDate.toISOString()).toBe('2030-10-27T22:59:59.999Z');
    expect(weeks[1].startDate.toISOString()).toBe('2030-10-27T23:00:00.000Z');
    expect(weeks[1].endDate).toEqual(data.endDate);
    expect(db.event.create).not.toHaveBeenCalled();
  });
  test('rejects athlete-only writes even for their own profile', async () => {
    const { db, service } = setup();
    await expect(
      service.create({ userId: 4, roles: ['ATHLETE'] } as AuthUser, input()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.trainingPlan.create).not.toHaveBeenCalled();
  });
  test('rejects an unrelated athlete without writing', async () => {
    const { db, service } = setup();
    db.athlete.findFirst.mockResolvedValue(null);
    await expect(service.create(coach, input())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.trainingPlan.create).not.toHaveBeenCalled();
  });
  test('coach-only authorization excludes their unused athlete profile', async () => {
    const { db } = setup();
    await authorizePlanAthlete(
      db as unknown as Prisma.TransactionClient,
      coach,
      4,
    );
    expect(db.athlete.findFirst.mock.calls[0][0].where.OR).toEqual([
      { coachAthletes: { some: { userId: 7 } } },
    ]);
  });
  test('rejects a duplicate plan instead of creating a second one', async () => {
    const { service } = setup();
    await expect(service.create(coach, input())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  test('maps a session to a week only within the selected athlete and editable plan', async () => {
    const { db } = setup();
    expect(
      await findPlanWeek(
        db as unknown as Prisma.TransactionClient,
        10,
        4,
        new Date('2030-10-25T08:00:00Z'),
        new Date('2030-10-25T09:00:00Z'),
      ),
    ).toBe(11);
    expect(db.trainingPlan.findFirst.mock.calls[0][0].where).toEqual({
      trainingPlanId: 10,
      athleteId: 4,
      status: { in: ['DRAFT', 'ACTIVE'] },
    });
    await expect(
      findPlanWeek(
        db as unknown as Prisma.TransactionClient,
        10,
        4,
        new Date('2030-10-31'),
        new Date('2030-11-01'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    db.trainingPlan.findFirst.mockResolvedValue(null);
    await expect(
      findPlanWeek(
        db as unknown as Prisma.TransactionClient,
        10,
        99,
        new Date('2030-10-25'),
        new Date('2030-10-26'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Plan races', () => {
  test('creates a calendar competition and its plan relation in one transaction', async () => {
    const { db, service } = setup();
    await service.saveRace(coach, 10, race());
    expect(db.event.create.mock.calls[0][0].data).toMatchObject({
      athleteId: 4,
      type: 'COMPETITION',
    });
    expect(db.trainingPlanRace.create).toHaveBeenCalledWith({
      data: { trainingPlanId: 10, eventCompetitionId: 12, priority: 'TARGET' },
    });
  });
  test('rejects a second target race before creating any event', async () => {
    const { db, service } = setup();
    db.trainingPlanRace.findMany.mockResolvedValue([
      {
        priority: 'TARGET',
        competition: { event: { startDate: new Date('2030-10-28') } },
      },
    ]);
    await expect(service.saveRace(coach, 10, race())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.event.create).not.toHaveBeenCalled();
  });
  test('rejects a preparation race after the target', async () => {
    const { db, service } = setup();
    db.trainingPlanRace.findMany.mockResolvedValue([
      {
        priority: 'TARGET',
        competition: { event: { startDate: new Date('2030-10-28') } },
      },
    ]);
    await expect(
      service.saveRace(coach, 10, race({ priority: 'PREPARATORY' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  test('rejects target races before existing preparation races', async () => {
    const { db, service } = setup();
    db.trainingPlanRace.findMany.mockResolvedValue([
      {
        priority: 'PREPARATORY',
        competition: { event: { startDate: new Date('2030-10-30') } },
      },
    ]);
    await expect(service.saveRace(coach, 10, race())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  test('rejects races outside plan dates without writes', async () => {
    const { db, service } = setup();
    await expect(
      service.saveRace(coach, 10, race({ startDate: '2030-11-01' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.event.create).not.toHaveBeenCalled();
  });
  test('links existing competitions without duplicating calendar events', async () => {
    const { db, service } = setup();
    db.event.findFirst.mockResolvedValue({
      competition: { eventCompetitionId: 12 },
      startDate: new Date('2030-10-29T08:00:00Z'),
      endDate: new Date('2030-10-29T09:00:00Z'),
    });
    await service.linkRace(coach, 10, { eventId: 20, priority: 'TARGET' });
    expect(db.event.findFirst.mock.calls[0][0].where).toMatchObject({
      athleteId: 4,
      type: 'COMPETITION',
      eventId: 20,
    });
    expect(db.event.create).not.toHaveBeenCalled();
    expect(db.trainingPlanRace.create).toHaveBeenCalled();
  });
  test('unlinking keeps the calendar competition', async () => {
    const { db, service } = setup();
    await service.unlinkRace(coach, 10, 12);
    expect(db.trainingPlanRace.deleteMany).toHaveBeenCalled();
    expect(db.event.delete).not.toHaveBeenCalled();
  });
  test('rejects edits to completed races', async () => {
    const { db, service } = setup();
    db.trainingPlanRace.findUnique.mockResolvedValue({
      competition: { relatedActivityId: 1 },
    });
    await expect(
      service.saveRace(coach, 10, race(), 12),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.event.update).not.toHaveBeenCalled();
  });
});

describe('Linked race edits from the calendar', () => {
  function linkedRace(priority = 'TARGET') {
    const { db, plan } = setup();
    db.trainingPlanRace.findMany.mockResolvedValue([
      {
        eventCompetitionId: 12,
        priority,
        plan: {
          ...plan,
          races: [
            {
              eventCompetitionId: 13,
              priority: priority === 'TARGET' ? 'PREPARATORY' : 'TARGET',
              competition: {
                event: { startDate: new Date('2030-10-25T08:00:00Z') },
              },
            },
          ],
        },
      },
    ]);
    return db;
  }
  test('preserves plan boundaries for calendar edits', async () => {
    const db = linkedRace();
    await expect(
      validateLinkedRaceDates(
        db as unknown as Prisma.TransactionClient,
        20,
        new Date('2030-11-01'),
        new Date('2030-11-02'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  test.each([
    ['TARGET', '2030-10-24'],
    ['PREPARATORY', '2030-10-26'],
  ])(
    'rejects invalid chronology for %s edited in calendar',
    async (priority, date) => {
      const db = linkedRace(priority);
      await expect(
        validateLinkedRaceDates(
          db as unknown as Prisma.TransactionClient,
          20,
          new Date(date),
          new Date(date),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  test('allows valid calendar changes', async () => {
    const db = linkedRace();
    await expect(
      validateLinkedRaceDates(
        db as unknown as Prisma.TransactionClient,
        20,
        new Date('2030-10-29'),
        new Date('2030-10-29'),
      ),
    ).resolves.toBeUndefined();
  });
});
