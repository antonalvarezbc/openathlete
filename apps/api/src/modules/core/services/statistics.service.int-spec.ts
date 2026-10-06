import { ForbiddenException } from '@nestjs/common';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import {
  DELETED_ATHLETE_ID,
  DELETED_USER_ID,
  accountFixtureSql,
} from 'src/modules/auth/services/account-deletion.fixture';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { StatisticsService } from './statistics.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

describe('StatisticsService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: StatisticsService;
  const athlete = {
    userId: DELETED_USER_ID,
    email: 'athlete@example.com',
    athlete: { athleteId: DELETED_ATHLETE_ID },
    coachAthletes: [],
  } as unknown as AuthUser;
  // Neither the athlete nor one of their coaches
  const stranger = {
    userId: 999_001,
    email: 'stranger@example.com',
    athlete: null,
    coachAthletes: [],
  } as unknown as AuthUser;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    service = new StatisticsService(prisma, new CaslAbilityFactory());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.table_name}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    for (const sql of accountFixtureSql) await prisma.$executeRawUnsafe(sql);
  });

  it('sums each week by sport, empty weeks included', async () => {
    // Next to the fixture's run on Tuesday 6 January 2026: a ride on Sunday
    // 18 January, the last day of its week
    await prisma.event.create({
      data: {
        name: 'Ride',
        type: 'ACTIVITY',
        startDate: new Date('2026-01-18T22:00:00Z'),
        endDate: new Date('2026-01-18T23:30:00Z'),
        athleteId: DELETED_ATHLETE_ID,
        activity: {
          create: {
            sport: 'CYCLING',
            distance: 40000,
            elevationGain: 300,
            movingTime: 5400,
            averageSpeed: 7.4,
            maxSpeed: 12,
            externalId: 'ride',
          },
        },
      },
    });

    const weeks = await service.getWeeklyVolume(
      athlete,
      DELETED_ATHLETE_ID,
      4,
      new Date('2026-01-21T12:00:00Z'),
    );

    expect(weeks.map((week) => week.weekStart.toISOString())).toEqual([
      '2025-12-29T00:00:00.000Z',
      '2026-01-05T00:00:00.000Z',
      '2026-01-12T00:00:00.000Z',
      '2026-01-19T00:00:00.000Z',
    ]);
    expect(weeks[0].sports).toEqual([]);
    expect(weeks[1].sports).toEqual([
      expect.objectContaining({ sport: 'RUNNING', distance: 10000, count: 1 }),
    ]);
    expect(weeks[2].sports).toEqual([
      {
        sport: 'CYCLING',
        duration: 5400,
        distance: 40000,
        elevationGain: 300,
        count: 1,
      },
    ]);
    expect(weeks[3].sports).toEqual([]);
  });

  it('lets the athlete read their own statistics', async () => {
    await expect(
      service.getStatisticsForPeriod(
        athlete,
        DELETED_ATHLETE_ID,
        new Date('2026-01-01'),
        new Date('2026-02-01'),
      ),
    ).resolves.toMatchObject({ count: 1 });
  });

  it("refuses another athlete's statistics", async () => {
    await expect(
      service.getWeeklyVolume(stranger, DELETED_ATHLETE_ID, 4),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.getStatisticsForPeriod(
        stranger,
        DELETED_ATHLETE_ID,
        new Date('2026-01-01'),
        new Date('2026-02-01'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
