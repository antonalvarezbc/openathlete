import { AiTask } from '@openathlete/shared';

import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { AiPolicyService } from './ai-policy.service';
import { AiUsageOwner, AiUsageService } from './ai-usage.service';

// Integration test: needs a migrated, disposable PostgreSQL database.
const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );
}

const OCTOBER = new Date('2026-10-15T12:00:00Z');
const NOVEMBER = new Date('2026-11-01T00:30:00Z');

describe('AiUsageService (PostgreSQL)', () => {
  let prisma: PrismaService;
  const policy: { hostedMonthlyTokens: number | undefined } = {
    hostedMonthlyTokens: undefined,
  };
  let service: AiUsageService;
  let userId: number;
  let otherUserId: number;

  const hosted = (): AiUsageOwner => ({
    userId,
    task: AiTask.EVENT_GENERATION,
    source: 'hosted',
  });

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    service = new AiUsageService(prisma, policy as AiPolicyService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "user", ai_usage RESTART IDENTITY CASCADE',
    );
    policy.hostedMonthlyTokens = undefined;
    const user = (email: string) =>
      prisma.user.create({
        data: { email, password: 'x', firstName: 'A', lastName: 'B' },
      });
    userId = (await user('athlete@example.com')).userId;
    otherUserId = (await user('other@example.com')).userId;
  });

  it('adds up the tokens of a month, per key source', async () => {
    await service.record(
      hosted(),
      { inputTokens: 100, outputTokens: 20 },
      OCTOBER,
    );
    await service.record(
      hosted(),
      { inputTokens: 50, outputTokens: 5 },
      OCTOBER,
    );
    await service.record(
      { userId, task: AiTask.FEEDBACK_EXTRACTION, source: 'own_key' },
      { inputTokens: 7, outputTokens: 3 },
      OCTOBER,
    );

    await expect(service.describe(userId, OCTOBER)).resolves.toEqual({
      hostedTokens: 175,
      ownKeyTokens: 10,
      hostedLimit: null,
      resetsAt: '2026-11-01T00:00:00.000Z',
    });
    const rows = await prisma.aiUsage.findMany({ orderBy: { task: 'asc' } });
    expect(rows).toEqual([
      expect.objectContaining({ source: 'HOSTED', calls: 2, inputTokens: 150 }),
      expect.objectContaining({ source: 'OWN_KEY', calls: 1 }),
    ]);
  });

  it('counts concurrent calls without losing any', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        service.record(hosted(), { inputTokens: 10, outputTokens: 1 }, OCTOBER),
      ),
    );

    const row = await prisma.aiUsage.findFirstOrThrow();
    expect(row).toMatchObject({
      calls: 10,
      inputTokens: 100,
      outputTokens: 10,
    });
  });

  it('starts again each month, in UTC', async () => {
    await service.record(
      hosted(),
      { inputTokens: 900, outputTokens: 100 },
      OCTOBER,
    );

    await expect(service.describe(userId, NOVEMBER)).resolves.toMatchObject({
      hostedTokens: 0,
      resetsAt: '2026-12-01T00:00:00.000Z',
    });
  });

  it('enforces the monthly allowance on the instance keys only', async () => {
    policy.hostedMonthlyTokens = 1000;
    await service.record(
      { userId, task: AiTask.EVENT_GENERATION, source: 'own_key' },
      { inputTokens: 5000, outputTokens: 0 },
      OCTOBER,
    );
    await expect(service.hasHostedAllowanceLeft(userId, OCTOBER)).resolves.toBe(
      true,
    );

    await service.record(
      hosted(),
      { inputTokens: 900, outputTokens: 100 },
      OCTOBER,
    );

    await expect(service.hasHostedAllowanceLeft(userId, OCTOBER)).resolves.toBe(
      false,
    );
    await expect(
      service.hasHostedAllowanceLeft(otherUserId, OCTOBER),
    ).resolves.toBe(true);
    await expect(
      service.hasHostedAllowanceLeft(userId, NOVEMBER),
    ).resolves.toBe(true);
  });

  it('counts a call whose provider reported no tokens', async () => {
    await service.record(hosted(), undefined, OCTOBER);

    await expect(prisma.aiUsage.findFirstOrThrow()).resolves.toMatchObject({
      calls: 1,
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("is deleted with the user's account", async () => {
    await service.record(
      hosted(),
      { inputTokens: 1, outputTokens: 1 },
      OCTOBER,
    );

    await prisma.user.delete({ where: { userId } });

    await expect(prisma.aiUsage.count()).resolves.toBe(0);
  });
});
