import { ForbiddenException } from '@nestjs/common';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';
// Load order of the auth/subscription barrels (circular import).
import '../../subscription';
import { SubscriptionService } from '../../subscription/services/subscription.service';
import { ensureSelfCoachingLink } from '../helpers/self-coaching';
import { AthleteService } from './athlete.service';

const both: AuthUser = {
  userId: 8,
  email: 'coach@example.test',
  roles: ['ATHLETE', 'COACH'],
  athlete: { athleteId: 31 },
};

function linkStore(existing: boolean) {
  const tx = {
    $queryRaw: jest.fn(),
    coachAthlete: {
      findFirst: jest
        .fn()
        .mockResolvedValue(existing ? { coachAthleteId: 1 } : null),
      create: jest.fn(),
    },
  };
  return tx;
}

describe('ensureSelfCoachingLink', () => {
  it('locks the user row, then creates the link once', async () => {
    const tx = linkStore(false);
    await expect(ensureSelfCoachingLink(tx as never, 8, 31)).resolves.toEqual({
      created: true,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.coachAthlete.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.coachAthlete.create).toHaveBeenCalledWith({
      data: { userId: 8, athleteId: 31 },
    });

    const again = linkStore(true);
    await expect(
      ensureSelfCoachingLink(again as never, 8, 31),
    ).resolves.toEqual({ created: false });
    expect(again.coachAthlete.create).not.toHaveBeenCalled();
  });
});

describe('AthleteService self-coaching', () => {
  const setup = (existing = false) => {
    const tx = linkStore(existing);
    const prisma = {
      $transaction: jest.fn((run: (client: unknown) => unknown) => run(tx)),
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AthleteService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, tx };
  };

  it("links the account's own athlete profile to it as coach", async () => {
    const { service, tx } = setup();
    await expect(service.coachSelf(both)).resolves.toEqual({ created: true });
    expect(tx.coachAthlete.create).toHaveBeenCalledWith({
      data: { userId: 8, athleteId: 31 },
    });
  });

  it('requires both roles and an athlete profile', async () => {
    for (const user of [
      { ...both, roles: ['COACH' as const] },
      { ...both, roles: ['ATHLETE' as const] },
      { ...both, athlete: null },
    ]) {
      const { service, prisma } = setup();
      await expect(service.coachSelf(user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it("lists the coaches of the user's athlete profile, never the user", async () => {
    const { service, prisma } = setup();
    await service.getMyCoaches(8);
    // The athlete ID (31) is not the user ID (8): match the profile's owner.
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        userId: { not: 8 },
        coachAthletes: { some: { athlete: { userId: 8 } } },
      },
    });
  });
});

describe('athlete limits', () => {
  it('do not count coaching yourself as an athlete', async () => {
    const prisma = { coachAthlete: { count: jest.fn().mockResolvedValue(1) } };
    const service = new SubscriptionService(
      prisma as unknown as PrismaService,
      {} as never,
      { get: () => false } as never,
    );
    jest.spyOn(service, 'getMaxAthletesForUser').mockResolvedValue(1);

    await expect(service.canAddAthlete(8)).resolves.toBe(false);
    await expect(service.isOverAthleteLimit(8)).resolves.toBe(false);
    for (const [args] of prisma.coachAthlete.count.mock.calls)
      expect(args).toEqual({
        where: { userId: 8, athlete: { userId: { not: 8 } } },
      });
  });
});
