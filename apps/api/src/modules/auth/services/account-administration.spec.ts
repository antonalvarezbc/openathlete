import { ConfigService } from '@nestjs/config';

import {
  changeAccountModeSchema,
  completeOnboardingDtoSchema,
  updateAccountDtoSchema,
} from '@openathlete/shared';

import { PrismaService } from '../../prisma/services/prisma.service';
import { AuthUser } from '../decorators/user.decorator';
import {
  AccountAdministrationService,
  isAccountAdministrator,
} from './account-administration.service';
import { UserService } from './user.service';

const user: AuthUser = {
  userId: 8,
  email: 'qa@example.test',
  roles: ['COACH'],
  athlete: { athleteId: 8 },
};

describe('Administrator-only mode changes', () => {
  it('administrator identity comes only from server configuration', () => {
    expect(isAccountAdministrator(8, ' 8,12 ')).toBe(true);
    for (const value of [undefined, '', '18', '8foo', '8.0', '0x8'])
      expect(isAccountAdministrator(8, value)).toBe(false);
  });
  it('coach role alone never grants administration or exposes account lists', async () => {
    const prisma = { user: { findMany: jest.fn(), updateMany: jest.fn() } };
    const service = new AccountAdministrationService(
      prisma as unknown as PrismaService,
      new ConfigService({ ADMIN_USER_IDS: '99' }),
    );
    await expect(service.list(user, '', 0)).rejects.toThrow('Administrator');
    await expect(
      service.change(user, 12, { roles: ['COACH'] }),
    ).rejects.toThrow('Administrator');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('configured admin changes only modes after onboarding, without granting administrator access', async () => {
    const prisma = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new AccountAdministrationService(
      prisma as unknown as PrismaService,
      new ConfigService({ ADMIN_USER_IDS: '8' }),
    );
    await service.change(user, 12, { roles: ['ATHLETE'] });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { userId: 12, onboardingCompleted: true },
      data: { roles: ['ATHLETE'] },
    });
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.change(user, 12, { roles: ['COACH'] }),
    ).rejects.toThrow('onboarding');
  });
  it('rejects duplicate roles, empty modes and extra admin flags', () => {
    for (const roles of [[], ['COACH', 'COACH'], ['ADMIN']]) {
      expect(changeAccountModeSchema.safeParse({ roles }).success).toBe(false);
      expect(completeOnboardingDtoSchema.safeParse({ roles }).success).toBe(
        false,
      );
    }
    expect(
      changeAccountModeSchema.safeParse({ roles: ['ATHLETE'], isAdmin: true })
        .success,
    ).toBe(false);
    expect(updateAccountDtoSchema.safeParse({ roles: ['COACH'] }).success).toBe(
      false,
    );
  });
});

describe('First-login selection is single-use', () => {
  function setup(count = 1) {
    const tx = {
      user: { updateMany: jest.fn().mockResolvedValue({ count }) },
      athlete: { findUnique: jest.fn().mockResolvedValue({ athleteId: 8 }) },
      athleteMetric: { upsert: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (fn) => fn(tx)) };
    const invitations = { createInvitation: jest.fn() };
    const service = new UserService(
      prisma as unknown as PrismaService,
      new ConfigService() as never,
      {} as never,
      {} as never,
      invitations as never,
      invitations as never,
    );
    return { service, tx, prisma, invitations };
  }
  it.each([
    { roles: ['ATHLETE' as const] },
    { roles: ['COACH' as const] },
    { roles: ['ATHLETE' as const, 'COACH' as const] },
  ])('persists initial mode $roles atomically', async ({ roles: selected }) => {
    const { service, tx } = setup();
    await service.completeOnboarding(user, { roles: selected });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { userId: 8, onboardingCompleted: false },
      data: { roles: selected, gender: undefined, onboardingCompleted: true },
    });
  });
  it('rejects replay before touching metrics or sending invitations', async () => {
    const { service, tx, invitations } = setup(0);
    await expect(
      service.completeOnboarding(user, {
        roles: ['COACH'],
        athleteEmails: ['qa2@example.test'],
      }),
    ).rejects.toThrow('administrator');
    expect(tx.athlete.findUnique).not.toHaveBeenCalled();
    expect(tx.athleteMetric.upsert).not.toHaveBeenCalled();
    expect(invitations.createInvitation).not.toHaveBeenCalled();
  });
  it('does not create personal wellness metrics for a coach-only account', async () => {
    const { service, tx } = setup();
    await service.completeOnboarding(user, {
      roles: ['COACH'],
      weight: 70,
      hrMax: 180,
    });
    expect(tx.athleteMetric.upsert).not.toHaveBeenCalled();
  });
});
