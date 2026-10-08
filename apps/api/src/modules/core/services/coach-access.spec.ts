import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { changeAccountModeSchema } from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { UserTypeGuard } from '../../auth/guards/user-type.guard';
import { AccountAdministrationService } from '../../auth/services/account-administration.service';
import { AuthService } from '../../auth/services/auth.service';
import { PrismaService } from '../../prisma/services/prisma.service';
import { AthleteController } from '../controllers/athlete.controller';
import { CoachController } from '../controllers/coach.controller';
import { AthleteService } from './athlete.service';
import { CoachService } from './coach.service';

const administrator = { userId: 99 } as AuthUser;
type AccountRoles = NonNullable<AuthUser['roles']>;

function setup() {
  const account = {
    userId: 8,
    email: 'coach@example.test',
    roles: ['ATHLETE', 'COACH'] as AccountRoles,
    onboardingCompleted: true,
  };
  const links = [{ userId: 8, athleteId: 31, athlete: { userId: 20 } }];
  const athlete = {
    athleteId: 31,
    userId: 20,
    user: { firstName: 'Test', lastName: 'Athlete', email: 'a@example.test' },
    trainingZones: [{ name: 'Zone 2' }],
  };
  const client = {
    user: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { userId: number; onboardingCompleted: boolean };
          data: { roles: AccountRoles };
        }) => {
          if (
            where.userId !== account.userId ||
            where.onboardingCompleted !== account.onboardingCompleted
          )
            return { count: 0 };
          account.roles = [...data.roles];
          return { count: 1 };
        },
      ),
      findUnique: jest.fn(async () => ({
        ...account,
        roles: [...account.roles],
        athlete: { athleteId: 7 },
        coachAthletes: links.map(({ athleteId }) => ({ athleteId })),
      })),
    },
    coachAthlete: {
      deleteMany: jest.fn(
        async ({
          where,
        }: {
          where: { userId: number; athlete: { userId: number } };
        }) => {
          const removed = links.filter(
            (link) =>
              link.userId === where.userId &&
              link.athlete.userId === where.athlete.userId,
          );
          removed.forEach((link) => links.splice(links.indexOf(link), 1));
          return { count: removed.length };
        },
      ),
    },
    athlete: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { coachAthletes: { some: { userId: number } } };
        }) =>
          links.some((link) => link.userId === where.coachAthletes.some.userId)
            ? [athlete]
            : [],
      ),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    athleteInjury: { findMany: jest.fn().mockResolvedValue([]) },
    message: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    ...client,
    $transaction: jest.fn(async (run: (tx: typeof client) => unknown) =>
      run(client),
    ),
  } as unknown as PrismaService;
  const config = new ConfigService({ ADMIN_USER_IDS: '99' });
  const admin = new AccountAdministrationService(prisma, config, {} as never);
  const auth = new AuthService(
    prisma,
    {} as never,
    config as never,
    {} as never,
  );
  const athletes = new AthleteController(
    new AthleteService(prisma, {} as never, {} as never, {} as never),
    {} as never,
    {} as never,
  );
  const coach = new CoachController(
    new CoachService(prisma, {
      getTrainingLoadMetrics: jest
        .fn()
        .mockResolvedValue({ ctl: 0, atl: 0, tsb: 0 }),
    } as never),
    {} as never,
  );
  const reloadUser = () =>
    auth.validateUser({
      userId: account.userId,
      email: account.email,
      type: 'access',
    });
  return { account, links, client, admin, athletes, coach, reloadUser };
}

function allows(
  controller: object,
  handler: (...args: never[]) => unknown,
  user: AuthUser,
) {
  return new UserTypeGuard(new Reflector()).canActivate({
    getHandler: () => handler,
    getClass: () => controller.constructor,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext);
}

describe('Coach readers after an account mode change', () => {
  it('denies both HTTP guards and services after COACH is removed, even with retained athlete links', async () => {
    const { admin, athletes, coach, reloadUser, client, links } = setup();
    await admin.change(
      administrator,
      8,
      changeAccountModeSchema.parse({ roles: ['ATHLETE'] }),
    );
    // Authenticate again: this is the current database role, not a stale token claim.
    const user = await reloadUser();
    expect(user.roles).toEqual(['ATHLETE']);
    expect(links).toHaveLength(1);
    expect(user.coachAthletes).toEqual([{ athleteId: 31 }]);
    expect(allows(athletes, athletes.getMyCoachedAthletes, user)).toBe(false);
    expect(allows(coach, coach.getDashboard, user)).toBe(false);
    // Direct controller calls also fail in the service, independently of guards.
    await expect(athletes.getMyCoachedAthletes(user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(coach.getDashboard(user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(client.athlete.findMany).not.toHaveBeenCalled();
    expect(client.event.findMany).not.toHaveBeenCalled();
    expect(client.athleteInjury.findMany).not.toHaveBeenCalled();
  });

  it.each<{ roles: AccountRoles }>([
    { roles: ['COACH'] },
    { roles: ['ATHLETE', 'COACH'] },
  ])(
    'allows the retained athletes after the administrator restores mode $roles',
    async ({ roles }) => {
      const { admin, athletes, coach, reloadUser, client } = setup();
      await admin.change(administrator, 8, { roles: ['ATHLETE'] });
      await admin.change(
        administrator,
        8,
        changeAccountModeSchema.parse({ roles }),
      );
      const user = await reloadUser();
      expect(allows(athletes, athletes.getMyCoachedAthletes, user)).toBe(true);
      expect(allows(coach, coach.getDashboard, user)).toBe(true);
      expect(await athletes.getMyCoachedAthletes(user)).toEqual([
        expect.objectContaining({ athleteId: 31 }),
      ]);
      expect((await coach.getDashboard(user)).athletes).toEqual([
        expect.objectContaining({ athleteId: 31, email: 'a@example.test' }),
      ]);
      for (const [query] of client.athlete.findMany.mock.calls) {
        expect(query.where).toEqual({ coachAthletes: { some: { userId: 8 } } });
      }
    },
  );
});
