import { ForbiddenException } from '@nestjs/common';

import { coachOverviewQuerySchema } from '@openathlete/shared';

import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { CoachService } from './coach.service';

const coach = { userId: 3, roles: ['ATHLETE', 'COACH'] } as AuthUser;
// The coach's local day boundaries, as the browser sends them.
const from = new Date('2026-09-28T22:00:00.000Z');
const today = new Date('2026-10-04T22:00:00.000Z');
const until = new Date('2026-10-11T22:00:00.000Z');
const day = (iso: string) => new Date(iso);

const session = (
  eventId: number,
  athleteId: number,
  startDate: string,
  options: {
    goalDuration?: number;
    movingTime?: number;
    linked?: boolean;
  } = {},
) => ({
  eventId,
  athleteId,
  name: `Session ${eventId}`,
  startDate: day(startDate),
  training: {
    sport: 'RUNNING',
    goalDuration: options.goalDuration ?? null,
    relatedActivity:
      options.linked || options.movingTime !== undefined
        ? { movingTime: options.movingTime ?? 0 }
        : null,
  },
});

function setup() {
  const sessions = [
    // Athlete 7: three due sessions, one done, one today, two upcoming.
    session(10, 7, '2026-10-06T06:00:00.000Z'),
    session(11, 7, '2026-10-05T06:00:00.000Z', { linked: true }),
    session(12, 7, '2026-10-04T06:00:00.000Z', {
      goalDuration: 3600,
      movingTime: 3300,
    }),
    session(13, 7, '2026-10-03T06:00:00.000Z', { goalDuration: 2400 }),
    session(14, 7, '2026-10-01T06:00:00.000Z'),
    session(15, 7, '2026-09-30T06:00:00.000Z'),
    session(16, 7, '2026-09-29T06:00:00.000Z'),
  ].sort((a, b) => +b.startDate - +a.startDate);
  const prisma = {
    athlete: {
      findMany: jest.fn().mockResolvedValue([
        {
          athleteId: 7,
          userId: 20,
          user: { firstName: 'Ana', lastName: 'Ruiz' },
        },
        {
          athleteId: 31,
          userId: 3,
          user: { firstName: 'Me', lastName: 'Coach' },
        },
      ]),
    },
    event: {
      findMany: jest.fn(({ where }: { where: { type: string } }) =>
        Promise.resolve(
          where.type === 'TRAINING'
            ? sessions
            : [
                {
                  athleteId: 7,
                  activity: { relatedTraining: { eventTrainingId: 1 } },
                },
                {
                  athleteId: 7,
                  activity: { relatedCompetition: { eventCompetitionId: 2 } },
                },
                { athleteId: 7, activity: {} },
                { athleteId: 31, activity: {} },
              ],
        ),
      ),
      groupBy: jest.fn().mockResolvedValue([
        {
          athleteId: 7,
          _max: { startDate: day('2026-10-04T06:00:00.000Z') },
        },
      ]),
    },
    athleteInjury: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ athleteId: 31, _count: { _all: 2 } }]),
    },
  };
  return {
    prisma,
    // The overview reads no training load
    service: new CoachService(prisma as unknown as PrismaService, {} as never),
  };
}

describe('CoachService.getCoachOverview', () => {
  it('counts due sessions as done only with a linked activity', async () => {
    const { service } = setup();
    const { athletes } = await service.getCoachOverview(coach, {
      from,
      today,
      until,
    });
    const ana = athletes.find((athlete) => athlete.athleteId === 7)!;
    expect(ana).toMatchObject({
      firstName: 'Ana',
      isSelf: false,
      // Due before today (Oct 5 local): sessions 12 to 16.
      due: 5,
      done: 1,
      compliancePercent: 20,
      // Only sessions with a goal duration count for time.
      plannedTime: 6000,
      completedTime: 3300,
      timePercent: 55,
      missedCount: 4,
      todayPlanned: 1,
      todayDone: 1,
      upcoming: 1,
      unlinkedActivities: 1,
      lastActivityAt: '2026-10-04T06:00:00.000Z',
      activeInjuries: 0,
    });
    // Newest first, at most three.
    expect(ana.missed.map((missed) => missed.eventId)).toEqual([13, 14, 15]);
    expect(ana.missed[0]).toEqual({
      eventId: 13,
      name: 'Session 13',
      startDate: '2026-10-03T06:00:00.000Z',
      sport: 'RUNNING',
    });
  });

  it('marks your own profile and leaves percentages empty without data', async () => {
    const { service } = setup();
    const { athletes } = await service.getCoachOverview(coach, {
      from,
      today,
      until,
    });
    expect(athletes.find((athlete) => athlete.athleteId === 31)).toMatchObject({
      isSelf: true,
      due: 0,
      compliancePercent: null,
      timePercent: null,
      lastActivityAt: null,
      unlinkedActivities: 1,
      activeInjuries: 2,
    });
  });

  it('reads only coached athletes within the requested days', async () => {
    const { service, prisma } = setup();
    await service.getCoachOverview(coach, { from, today, until });
    expect(prisma.athlete.findMany.mock.calls[0][0].where).toEqual({
      coachAthletes: { some: { userId: 3 } },
    });
    const [trainings, activities] = prisma.event.findMany.mock.calls.map(
      ([args]) => args.where,
    );
    expect(trainings).toMatchObject({
      athleteId: { in: [7, 31] },
      type: 'TRAINING',
      startDate: { gte: from, lt: until },
    });
    // Activities up to the end of today.
    expect(activities).toMatchObject({
      type: 'ACTIVITY',
      startDate: { gte: from, lt: new Date('2026-10-05T22:00:00.000Z') },
    });
  });

  it('needs the coach role and answers empty without athletes', async () => {
    const { service, prisma } = setup();
    await expect(
      service.getCoachOverview({ userId: 3, roles: ['ATHLETE'] } as AuthUser, {
        from,
        today,
        until,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.athlete.findMany.mockResolvedValue([]);
    await expect(
      service.getCoachOverview(coach, { from, today, until }),
    ).resolves.toEqual({ athletes: [] });
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });
});

describe('coachOverviewQuerySchema', () => {
  const parse = (query: Record<string, string>) =>
    coachOverviewQuerySchema.safeParse(query).success;

  it('accepts local day boundaries as ISO strings', () => {
    expect(
      parse({
        from: from.toISOString(),
        today: today.toISOString(),
        until: until.toISOString(),
      }),
    ).toBe(true);
  });

  it('rejects reversed, too short or too long windows', () => {
    expect(
      parse({
        from: until.toISOString(),
        today: today.toISOString(),
        until: until.toISOString(),
      }),
    ).toBe(false);
    expect(
      parse({
        from: from.toISOString(),
        today: today.toISOString(),
        until: today.toISOString(),
      }),
    ).toBe(false);
    expect(
      parse({
        from: '2026-01-01T00:00:00.000Z',
        today: today.toISOString(),
        until: until.toISOString(),
      }),
    ).toBe(false);
    expect(
      parse({
        from: from.toISOString(),
        today: today.toISOString(),
        until: until.toISOString(),
        athleteId: '7',
      }),
    ).toBe(false);
  });
});
