import { PrismaService } from '../../prisma/services/prisma.service';
import { resolveAiEventAthleteId } from './event-ai-helpers';

describe('resolveAiEventAthleteId', () => {
  const prisma = (linked: boolean) =>
    ({
      coachAthlete: {
        findFirst: jest
          .fn()
          .mockResolvedValue(linked ? { coachAthleteId: 1 } : null),
      },
    }) as unknown as PrismaService;

  it('uses the requested athlete when the coach is linked', async () => {
    await expect(
      resolveAiEventAthleteId(prisma(true), { userId: 3 }, 7),
    ).resolves.toBe(7);
  });

  it('rejects athletes the coach is not linked to', async () => {
    await expect(
      resolveAiEventAthleteId(prisma(false), { userId: 3 }, 7),
    ).rejects.toThrow('You cannot manage this athlete');
  });

  it("defaults to the caller's own athlete profile", async () => {
    const db = prisma(false);
    await expect(
      resolveAiEventAthleteId(db, { userId: 3, athlete: { athleteId: 9 } }),
    ).resolves.toBe(9);
  });

  it('never falls back to the user id', async () => {
    await expect(
      resolveAiEventAthleteId(prisma(true), { userId: 3 }),
    ).rejects.toThrow('athleteId is required');
  });
});
