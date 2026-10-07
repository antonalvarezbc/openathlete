import { NotFoundException } from '@nestjs/common';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { TrainingLoadService } from './training-load.service';

const athlete: AuthUser = {
  userId: 2,
  email: 'athlete@example.test',
  athlete: { athleteId: 12 },
  coachAthletes: [],
};
const coach: AuthUser = {
  userId: 1,
  email: 'coach@example.test',
  athlete: null,
  coachAthletes: [{ athleteId: 12 }],
};
const stranger: AuthUser = {
  userId: 3,
  email: 'stranger@example.test',
  athlete: { athleteId: 99 },
  coachAthletes: [{ athleteId: 13 }],
};

function setup() {
  const activity = {
    eventId: 50,
    athleteId: 12,
    type: 'ACTIVITY',
    activity: { eventActivityId: 101 },
  };
  const entries = [{ value: 48.6, calculation: { type: 'TRIMP' } }];
  // Stand-in for the database: the stored activity matches when the query
  // names it and, if the query restricts athletes, allows its athlete.
  const findFirst = jest.fn(async ({ where }: { where: unknown }) => {
    const query = JSON.stringify(where);
    const athletes = [...query.matchAll(/"athleteId":(\d+)/g)].map(([, id]) =>
      Number(id),
    );
    return query.includes('"eventId":50') &&
      (!athletes.length || athletes.includes(activity.athleteId))
      ? activity
      : null;
  });
  const prisma = {
    event: { findFirst },
    trainingLoadEntry: { findMany: jest.fn().mockResolvedValue(entries) },
  };
  const service = new TrainingLoadService(
    prisma as unknown as PrismaService,
    new CaslAbilityFactory(),
  );
  return { prisma, service, entries };
}

describe('TrainingLoadService.getActivityTrainingLoads', () => {
  it.each([
    ['the athlete', athlete],
    ['a linked coach', coach],
  ])('returns the saved loads to %s', async (_who, user) => {
    const { prisma, service, entries } = setup();
    await expect(service.getActivityTrainingLoads(user, 50)).resolves.toBe(
      entries,
    );
    expect(prisma.trainingLoadEntry.findMany).toHaveBeenCalledWith({
      where: { activityId: 101 },
      include: { calculation: true },
    });
  });

  it('hides activities of athletes the user is not linked to', async () => {
    const { prisma, service } = setup();
    await expect(
      service.getActivityTrainingLoads(stranger, 50),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trainingLoadEntry.findMany).not.toHaveBeenCalled();
  });
});

describe('TrainingLoadService weekly ACWR', () => {
  /** Weekly summaries for TRIMP entries keyed by day (one per week here). */
  async function weeks(
    loads: Record<string, number>,
    from: string,
    to: string,
  ) {
    const prisma = {
      athlete: { findFirst: jest.fn().mockResolvedValue({ athleteId: 12 }) },
      trainingLoadCalculation: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ trainingLoadCalculationId: 1 }),
      },
      trainingLoadEntry: {
        findMany: jest.fn().mockResolvedValue(
          Object.entries(loads).map(([day, value]) => ({
            date: new Date(`${day}T00:00:00Z`),
            value,
          })),
        ),
      },
      eventTraining: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TrainingLoadService(
      prisma as unknown as PrismaService,
      {
        getFor: jest.fn().mockResolvedValue({}),
      } as unknown as CaslAbilityFactory,
    );
    const summaries = await service.getWeeklyTrimpSummary(
      athlete,
      new Date(`${from}T00:00:00Z`),
      new Date(`${to}T00:00:00Z`),
    );
    return Object.fromEntries(
      summaries.map((week) => [
        week.weekStart.toISOString().slice(0, 10),
        { acwr: week.acwr, status: week.acwrStatus },
      ]),
    );
  }

  it('waits for three weeks of load and ignores the empty weeks before them', async () => {
    // A new athlete: no data before 17 August
    const result = await weeks(
      {
        '2026-08-17': 721,
        '2026-08-24': 483,
        '2026-08-31': 236,
        '2026-09-07': 1053,
      },
      '2026-08-17',
      '2026-09-07',
    );
    expect(result['2026-08-17']).toEqual({
      acwr: undefined,
      status: undefined,
    });
    expect(result['2026-08-24']).toEqual({
      acwr: undefined,
      status: undefined,
    });
    expect(result['2026-08-31']).toEqual({
      acwr: undefined,
      status: undefined,
    });
    // CTL over 721, 483 and 236, the latest weighing most: 419
    expect(result['2026-09-07']).toEqual({ acwr: 2.51, status: 'high_risk' });
  });

  it('gives an ACWR of 1 for steady training', async () => {
    const steady = Object.fromEntries(
      [
        '2026-08-03',
        '2026-08-10',
        '2026-08-17',
        '2026-08-24',
        '2026-08-31',
        '2026-09-07',
        '2026-09-14',
      ].map((day) => [day, 300]),
    );
    const result = await weeks(steady, '2026-09-14', '2026-09-14');
    expect(result['2026-09-14']).toEqual({ acwr: 1, status: 'optimal' });
  });

  it('still flags a return after a break within the chronic weeks', async () => {
    const result = await weeks(
      {
        '2026-08-03': 400,
        '2026-08-10': 400,
        '2026-08-17': 400,
        '2026-09-14': 400,
      },
      '2026-09-14',
      '2026-09-14',
    );
    expect(result['2026-09-14'].status).toBe('high_risk');
  });
});
