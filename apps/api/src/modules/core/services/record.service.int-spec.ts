import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import {
  DELETED_ATHLETE_ID,
  DELETED_USER_ID,
  accountFixtureSql,
} from 'src/modules/auth/services/account-deletion.fixture';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { RecordService } from './record.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

describe('RecordService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: RecordService;
  const athlete = {
    userId: DELETED_USER_ID,
    email: 'athlete@example.com',
    athlete: { athleteId: DELETED_ATHLETE_ID },
  } as AuthUser;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    // Reading one's own records needs no ability
    service = new RecordService(prisma, {} as CaslAbilityFactory);
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

  it('keeps the best record of each period, with its activity', async () => {
    // The fixture's run (event 3002, "Run", activity 3501)
    const record = (date: string, value: number) =>
      prisma.record.create({
        data: {
          type: 'SPEED',
          distance: 1000,
          value,
          date: new Date(date),
          athleteId: DELETED_ATHLETE_ID,
          eventActivityId: 3501,
        },
      });
    await prisma.record.deleteMany();
    await record('2025-06-01', 240);
    await record('2026-03-01', 250);
    await record('2026-04-01', 245);
    await prisma.record.create({
      data: {
        type: 'POWER',
        duration: 300,
        value: 280,
        date: new Date('2026-04-01'),
        athleteId: DELETED_ATHLETE_ID,
        eventActivityId: 3501,
      },
    });

    const allTime = await service.getRecords(athlete, { sport: 'RUNNING' });
    expect(
      allTime.map((r) => [r.type, r.distance, r.duration, r.value]),
    ).toEqual(
      expect.arrayContaining([
        ['SPEED', 1000, null, 240],
        ['POWER', null, 300, 280],
      ]),
    );
    expect(allTime).toHaveLength(2);
    expect(allTime[0]).toMatchObject({ eventId: 3002, activityName: 'Run' });

    const season = await service.getRecords(athlete, {
      sport: 'RUNNING',
      from: new Date('2026-01-01'),
      to: new Date('2027-01-01'),
    });
    expect(season.find((r) => r.type === 'SPEED')?.value).toBe(245);
    expect(await service.getRecords(athlete, { sport: 'CYCLING' })).toEqual([]);
  });

  it('lists the sports with records, the most frequent first', async () => {
    // Two rides next to the fixture's run
    for (const id of [1, 2]) {
      const event = await prisma.event.create({
        data: {
          name: `Ride ${id}`,
          type: 'ACTIVITY',
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-02-01'),
          athleteId: DELETED_ATHLETE_ID,
          activity: {
            create: {
              sport: 'CYCLING',
              distance: 20000,
              elevationGain: 0,
              movingTime: 2400,
              averageSpeed: 8,
              maxSpeed: 12,
              externalId: `ride-${id}`,
            },
          },
        },
        include: { activity: true },
      });
      await prisma.record.create({
        data: {
          type: 'SPEED',
          distance: 1000,
          value: 120,
          date: event.startDate,
          athleteId: DELETED_ATHLETE_ID,
          eventActivityId: event.activity!.eventActivityId,
        },
      });
    }

    expect(await service.getRecordSports(athlete)).toEqual([
      'CYCLING',
      'RUNNING',
    ]);
  });
});
