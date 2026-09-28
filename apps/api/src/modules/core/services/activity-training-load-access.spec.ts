import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { CaslAbilityFactory } from '../../auth/services/casl-ability.factory';
import { PrismaService } from '../../prisma/services/prisma.service';
import { TrainingLoadService } from './training-load.service';

const owner: AuthUser = {
  userId: 2,
  email: 'owner@example.test',
  roles: ['ATHLETE'],
  athlete: { athleteId: 12 },
};
const coach: AuthUser = {
  userId: 1,
  email: 'coach@example.test',
  roles: ['COACH'],
  athlete: null,
};

function setup() {
  const entries = [{ value: 48.5579, metadata: { calculationType: 'TRIMP' } }];
  const db = {
    event: {
      findFirst: jest.fn().mockResolvedValue({
        athleteId: 12,
        activity: { eventActivityId: 101 },
      }),
    },
    athlete: {
      findFirst: jest.fn().mockResolvedValue({
        athleteId: 12,
        userId: 2,
        user: { gender: 'FEMALE' },
      }),
    },
    coachAthlete: {
      findFirst: jest.fn().mockResolvedValue({ athleteId: 12, userId: 1 }),
    },
    trainingLoadEntry: {
      findMany: jest.fn().mockResolvedValue(entries),
      upsert: jest.fn(),
    },
  };
  const service = new TrainingLoadService(
    db as unknown as PrismaService,
    {} as CaslAbilityFactory,
  );
  return { db, service, entries };
}

describe('Saved activity training load access', () => {
  it.each([
    owner,
    coach,
    {
      ...coach,
      roles: ['COACH', 'ATHLETE'],
      athlete: { athleteId: 99 },
    } as AuthUser,
  ])(
    'returns the target athlete saved loads for owner or linked coach ($userId)',
    async (user) => {
      const { db, service, entries } = setup();
      await expect(
        service.getActivityTrainingLoads(user, 448),
      ).resolves.toEqual(entries);
      expect(db.event.findFirst).toHaveBeenCalledWith({
        where: { eventId: 448, type: 'ACTIVITY' },
        select: {
          athleteId: true,
          activity: { select: { eventActivityId: true } },
        },
      });
      expect(db.trainingLoadEntry.findMany).toHaveBeenCalledWith({
        where: { activityId: 101 },
        include: { calculation: true },
      });
      if (user.userId === owner.userId)
        expect(db.coachAthlete.findFirst).not.toHaveBeenCalled();
      else
        expect(db.coachAthlete.findFirst).toHaveBeenCalledWith({
          where: { userId: 1, athleteId: 12 },
        });
    },
  );

  it('rejects an unlinked coach even when their session lists the athlete', async () => {
    const { db, service } = setup();
    db.coachAthlete.findFirst.mockResolvedValue(null);
    await expect(
      service.getActivityTrainingLoads(
        { ...coach, coachAthletes: [{ athleteId: 12 }] },
        448,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(db.trainingLoadEntry.findMany).not.toHaveBeenCalled();
  });

  it('rejects another athlete without a coach role', async () => {
    const { db, service } = setup();
    await expect(
      service.getActivityTrainingLoads({ ...coach, roles: ['ATHLETE'] }, 448),
    ).rejects.toThrow(ForbiddenException);
    expect(db.coachAthlete.findFirst).not.toHaveBeenCalled();
    expect(db.trainingLoadEntry.findMany).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { athleteId: 12, activity: null },
    { athleteId: null, activity: { eventActivityId: 101 } },
  ])('returns not found for missing activities (%j)', async (event) => {
    const { db, service } = setup();
    db.event.findFirst.mockResolvedValue(event);
    await expect(service.getActivityTrainingLoads(owner, 448)).rejects.toThrow(
      NotFoundException,
    );
    expect(db.trainingLoadEntry.findMany).not.toHaveBeenCalled();
  });

  it('repeated reads reuse saved values without calculating or writing', async () => {
    const { db, service, entries } = setup();
    const calculate = jest.spyOn(service, 'calculateActivityLoad');
    for (let i = 0; i < 2; i++) {
      await expect(
        service.getActivityTrainingLoads(coach, 448),
      ).resolves.toEqual(entries);
    }
    expect(calculate).not.toHaveBeenCalled();
    expect(db.trainingLoadEntry.upsert).not.toHaveBeenCalled();
  });

  it('returns an empty result when no load is stored', async () => {
    const { db, service } = setup();
    db.trainingLoadEntry.findMany.mockResolvedValue([]);
    await expect(service.getActivityTrainingLoads(owner, 448)).resolves.toEqual(
      [],
    );
    expect(db.trainingLoadEntry.upsert).not.toHaveBeenCalled();
  });
});
