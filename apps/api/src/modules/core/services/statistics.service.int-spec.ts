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
      service.getStatisticsForPeriod(
        stranger,
        DELETED_ATHLETE_ID,
        new Date('2026-01-01'),
        new Date('2026-02-01'),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
