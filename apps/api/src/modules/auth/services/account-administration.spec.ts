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
import { AccountDeletionService } from './account-deletion.service';
import { UserService } from './user.service';

jest.mock('./account-deletion.service', () => ({
  AccountDeletionService: class {},
}));

const accountDeletion = { deleteAccount: jest.fn() };
const deletion = accountDeletion as unknown as AccountDeletionService;

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
      deletion,
    );
    await expect(service.list(user, '', 0)).rejects.toThrow('Administrator');
    await expect(
      service.change(user, 12, { roles: ['COACH'] }),
    ).rejects.toThrow('Administrator');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  const modeSetup = () => {
    const client = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      coachAthlete: { deleteMany: jest.fn() },
    };
    const prisma = {
      ...client,
      $transaction: jest.fn((run: (tx: typeof client) => unknown) =>
        run(client),
      ),
    };
    const service = new AccountAdministrationService(
      prisma as unknown as PrismaService,
      new ConfigService({ ADMIN_USER_IDS: '8' }),
      deletion,
    );
    return { prisma, service };
  };
  it('configured admin changes only modes after onboarding, without granting administrator access', async () => {
    const { prisma, service } = modeSetup();
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
  it('ends self-coaching when the account loses one of the two roles', async () => {
    const { prisma, service } = modeSetup();
    for (const roles of [['ATHLETE'], ['COACH']] as const) {
      prisma.coachAthlete.deleteMany.mockClear();
      await service.change(user, 12, { roles: [...roles] });
      // Only the link to the account's own athlete profile, not its athletes.
      expect(prisma.coachAthlete.deleteMany).toHaveBeenCalledWith({
        where: { userId: 12, athlete: { userId: 12 } },
      });
    }
    prisma.coachAthlete.deleteMany.mockClear();
    await service.change(user, 12, { roles: ['ATHLETE', 'COACH'] });
    expect(prisma.coachAthlete.deleteMany).not.toHaveBeenCalled();
    // A refused change (onboarding not done) touches no link.
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.change(user, 12, { roles: ['ATHLETE'] }),
    ).rejects.toThrow('onboarding');
    expect(prisma.coachAthlete.deleteMany).not.toHaveBeenCalled();
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
      coachAthlete: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
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
      {} as never,
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
  it('coaches yourself only when asked and with both roles', async () => {
    const { service, tx } = setup();
    await service.completeOnboarding(user, {
      roles: ['ATHLETE', 'COACH'],
      coachSelf: true,
    });
    expect(tx.coachAthlete.create).toHaveBeenCalledWith({
      data: { userId: 8, athleteId: 8 },
    });

    for (const input of [
      { roles: ['ATHLETE' as const, 'COACH' as const] },
      { roles: ['COACH' as const], coachSelf: true },
      { roles: ['ATHLETE' as const], coachSelf: true },
    ]) {
      const { service: other, tx: otherTx } = setup();
      await other.completeOnboarding(user, input);
      expect(otherTx.coachAthlete.create).not.toHaveBeenCalled();
    }
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

describe('Administrator account deletion', () => {
  const setup = (adminIds = '8') => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ userId: 12 }) },
    };
    const service = new AccountAdministrationService(
      prisma as unknown as PrismaService,
      new ConfigService({ ADMIN_USER_IDS: adminIds }),
      deletion,
    );
    return { prisma, service };
  };
  beforeEach(() => jest.clearAllMocks());

  it('deletes another account with the account deletion service', async () => {
    const { service } = setup();
    await expect(service.delete(user, 12)).resolves.toEqual({ success: true });
    expect(accountDeletion.deleteAccount).toHaveBeenCalledWith(12);
  });

  it('requires administrator access', async () => {
    const { service } = setup('99');
    await expect(service.delete(user, 12)).rejects.toThrow('Administrator');
    expect(accountDeletion.deleteAccount).not.toHaveBeenCalled();
  });

  it('refuses deleting itself, other administrators or missing accounts', async () => {
    const { service } = setup('8,12');
    await expect(service.delete(user, 8)).rejects.toThrow('themselves');
    await expect(service.delete(user, 12)).rejects.toThrow(
      'Administrator accounts',
    );
    const { prisma: other, service: plain } = setup();
    other.user.findUnique.mockResolvedValue(null);
    await expect(plain.delete(user, 40)).rejects.toThrow('not found');
    expect(accountDeletion.deleteAccount).not.toHaveBeenCalled();
  });
});
