import { ForbiddenException } from '@nestjs/common';

import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { CaslAbilityFactory } from 'src/modules/auth/services/casl-ability.factory';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { TrainingLoadService } from './training-load.service';

const athlete = {
  userId: 2,
  email: 'athlete@example.test',
  roles: ['ATHLETE'],
  athlete: { athleteId: 12 },
  coachAthletes: [],
} as AuthUser;
const coach = {
  userId: 1,
  email: 'coach@example.test',
  roles: ['COACH'],
  athlete: null,
  coachAthletes: [{ athleteId: 12 }],
} as AuthUser;
// A coach of someone else: the token says nothing about athlete 12.
const stranger = {
  userId: 3,
  email: 'stranger@example.test',
  roles: ['ATHLETE', 'COACH'],
  athlete: { athleteId: 99 },
  coachAthletes: [{ athleteId: 13 }],
} as AuthUser;

function setup() {
  const entries = [{ value: 48.6, calculation: { type: 'TRIMP' } }];
  const prisma = {
    event: {
      findFirst: jest.fn().mockResolvedValue({
        athleteId: 12,
        activity: { eventActivityId: 101 },
      }),
    },
    athlete: {
      findFirst: jest.fn().mockResolvedValue({ athleteId: 12, userId: 2 }),
    },
    // The coach link is checked in the database, not taken from the token.
    coachAthlete: {
      findFirst: jest.fn(
        async ({ where }: { where: { userId: number; athleteId: number } }) =>
          where.userId === 1 && where.athleteId === 12 ? { id: 1 } : null,
      ),
    },
    trainingLoadEntry: { findMany: jest.fn().mockResolvedValue(entries) },
  };
  const service = new TrainingLoadService(
    prisma as unknown as PrismaService,
    {} as CaslAbilityFactory,
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

  it('refuses users not linked to the athlete', async () => {
    const { prisma, service } = setup();
    await expect(
      service.getActivityTrainingLoads(stranger, 50),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.trainingLoadEntry.findMany).not.toHaveBeenCalled();
  });
});
