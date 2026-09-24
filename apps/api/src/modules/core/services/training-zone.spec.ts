import { ForbiddenException } from '@nestjs/common';

import {
  CreateTrainingZoneDto,
  SPORT_TYPE,
  TRAINING_ZONE_TYPE,
} from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { CaslAbilityFactory } from '../../auth/services/casl-ability.factory';
import { PrismaService } from '../../prisma/services/prisma.service';
import { TrainingZoneService } from './training-zone.service';

describe('Training zone permissions', () => {
  const user = (roles: AuthUser['roles']): AuthUser => ({
    userId: 1,
    email: 'qa@example.test',
    athlete: { athleteId: 10 },
    coachAthletes: [{ athleteId: 20 }],
    roles,
  });
  const dto: CreateTrainingZoneDto = {
    athleteId: 20,
    name: 'Z1',
    type: TRAINING_ZONE_TYPE.HEARTRATE,
    min: 100,
    max: 120,
    color: '#ffffff',
    sports: [SPORT_TYPE.RUNNING],
  };
  function setup(athleteId = 20) {
    const prisma = {
      athlete: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ athleteId, userId: athleteId === 10 ? 1 : 2 }),
      },
      trainingZone: {
        findUnique: jest.fn().mockResolvedValue({ athleteId, values: [] }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
      },
      trainingZoneValue: { deleteMany: jest.fn() },
    };
    return {
      prisma,
      service: new TrainingZoneService(
        prisma as unknown as PrismaService,
        new CaslAbilityFactory(),
      ),
    };
  }
  it.each([['ATHLETE'], undefined] as const)(
    'denies every mutation without coach role: %s',
    async (roles) => {
      const { service, prisma } = setup(10);
      const actor = user(roles ? [...roles] : undefined);
      await expect(service.create(actor, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.update(actor, 1, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.delete(actor, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.trainingZone.create).not.toHaveBeenCalled();
      expect(prisma.trainingZone.update).not.toHaveBeenCalled();
      expect(prisma.trainingZoneValue.deleteMany).not.toHaveBeenCalled();
    },
  );
  it('allows an athlete to read their zones', async () => {
    const { service } = setup(10);
    await expect(
      service.getAllForAthlete(user(['ATHLETE']), 10),
    ).resolves.toEqual([]);
  });
  it.each([20, 10])(
    'allows linked coaching and dual-role self coaching: %s',
    async (athleteId) => {
      const { service } = setup(athleteId);
      const actor = user(athleteId === 10 ? ['ATHLETE', 'COACH'] : ['COACH']);
      await expect(
        service.create(actor, { ...dto, athleteId }),
      ).resolves.toEqual({});
      await expect(service.update(actor, 1, dto)).resolves.toEqual({});
      await expect(service.delete(actor, 1)).resolves.toEqual({
        success: true,
      });
    },
  );
  it('denies unrelated coaches all mutations', async () => {
    const { service, prisma } = setup(99);
    const actor = user(['COACH']);
    await expect(
      service.create(actor, { ...dto, athleteId: 99 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(actor, 1, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.delete(actor, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.trainingZone.create).not.toHaveBeenCalled();
    expect(prisma.trainingZone.update).not.toHaveBeenCalled();
    expect(prisma.trainingZoneValue.deleteMany).not.toHaveBeenCalled();
  });
});
