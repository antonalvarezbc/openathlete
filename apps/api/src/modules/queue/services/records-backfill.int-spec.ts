import { accountFixtureSql } from 'src/modules/auth/services/account-deletion.fixture';
import { compressActivityStream } from 'src/modules/core/helpers/activity-stream';
import {
  ActivityRecordsService,
  RECORDS_VERSION,
} from 'src/modules/core/services/activity-records.service';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { RecordsBackfillService } from './records-backfill.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

// The fixture's activity 3501, on event 3002 of athlete 2001
const ACTIVITY_ID = 3501;
const METRES_PER_DEGREE = (2 * Math.PI * 6371000) / 360;

/** 2 km north at 4 m/s, one point every 5 s. */
const stream = compressActivityStream({
  time: Array.from({ length: 101 }, (_, i) => i * 5),
  latlng: Array.from({ length: 101 }, (_, i) => [
    45 + (i * 20) / METRES_PER_DEGREE,
    5,
  ]),
});

describe('records backfill (PostgreSQL)', () => {
  let prisma: PrismaService;
  let backfill: RecordsBackfillService;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    backfill = new RecordsBackfillService(
      prisma,
      new ActivityRecordsService(prisma),
    );
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
    await prisma.eventActivity.update({
      where: { eventActivityId: ACTIVITY_ID },
      data: { stream: stream as object },
    });
  });

  it('replaces the records of activities computed by an older version', async () => {
    expect(await backfill.run()).toBe(1);

    const records = await prisma.record.findMany({
      where: { eventActivityId: ACTIVITY_ID, type: 'SPEED' },
      orderBy: { distance: 'asc' },
    });
    // The fixture's stale 1 km record is gone, 2 km reaches up to 1500 m
    expect(records.map((r) => [r.distance, Math.round(r.value)])).toEqual([
      [400, 100],
      [800, 200],
      [1000, 250],
      [1500, 375],
    ]);
    // Dated by the activity, not by when it was computed
    expect(records[0].date.toISOString()).toBe('2026-01-06T00:00:00.000Z');
    expect(
      (
        await prisma.eventActivity.findUniqueOrThrow({
          where: { eventActivityId: ACTIVITY_ID },
        })
      ).recordsVersion,
    ).toBe(RECORDS_VERSION);
    // Records without an activity are left alone
    expect(
      await prisma.record.count({ where: { eventActivityId: null } }),
    ).toBe(1);
  });

  it('does nothing once every activity is up to date', async () => {
    await backfill.run();
    expect(await backfill.run()).toBe(0);
  });

  it('does not duplicate records when two refreshes overlap', async () => {
    const records = new ActivityRecordsService(prisma);
    await Promise.all([
      records.refresh(ACTIVITY_ID),
      records.refresh(ACTIVITY_ID),
    ]);
    expect(
      await prisma.record.count({ where: { eventActivityId: ACTIVITY_ID } }),
    ).toBe(4);
  });
});
