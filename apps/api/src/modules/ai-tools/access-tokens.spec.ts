import { ExecutionContext } from '@nestjs/common';

import { AuthUser } from '../auth/decorators/user.decorator';
import { PrismaService } from '../prisma/services/prisma.service';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokensService, hashAccessToken } from './access-tokens.service';

const user = { userId: 3, email: 'coach@example.test' } as AuthUser;
const owner = {
  userId: 3,
  email: 'coach@example.test',
  roles: ['COACH'],
  athlete: null,
  coachAthletes: [{ athleteId: 7 }],
};

function setup() {
  const prisma = {
    personalAccessToken: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(({ data }) =>
        Promise.resolve({ personalAccessTokenId: 1, ...data }),
      ),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return {
    prisma,
    tokens: new AccessTokensService(prisma as unknown as PrismaService),
  };
}

describe('personal access tokens', () => {
  it('returns the token once and stores only its hash', async () => {
    const { tokens, prisma } = setup();
    const created = await tokens.create(user, 'Claude Desktop', 90);
    expect(created.token).toMatch(/^oat_[A-Za-z0-9_-]{40}$/);
    const data = prisma.personalAccessToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashAccessToken(created.token));
    expect(JSON.stringify(data)).not.toContain(created.token);
    expect(data.prefix).toBe(created.token.slice(0, 12));
    expect(data.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 89 * 24 * 3600 * 1000,
    );
  });

  it('limits the number of active tokens', async () => {
    const { tokens, prisma } = setup();
    prisma.personalAccessToken.count.mockResolvedValue(10);
    await expect(tokens.create(user, 'x', null)).rejects.toThrow('Revoke');
  });

  it('authenticates valid tokens as their owner and rejects others', async () => {
    const { tokens, prisma } = setup();
    expect(await tokens.authenticate('not-a-token')).toBeNull();
    expect(prisma.personalAccessToken.findUnique).not.toHaveBeenCalled();

    prisma.personalAccessToken.findUnique.mockResolvedValue({
      personalAccessTokenId: 1,
      revokedAt: null,
      expiresAt: null,
      lastUsedAt: null,
      user: owner,
    });
    expect(await tokens.authenticate('oat_valid')).toEqual(owner);
    // Roles are read on every request, like JWT authentication, so the data
    // tools stop granting coach access as soon as the role is removed.
    expect(prisma.personalAccessToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashAccessToken('oat_valid') },
        select: expect.objectContaining({
          user: {
            select: expect.objectContaining({
              roles: true,
              athlete: { select: { athleteId: true } },
              coachAthletes: { select: { athleteId: true } },
            }),
          },
        }),
      }),
    );
    expect(prisma.personalAccessToken.update).toHaveBeenCalled();

    for (const state of [
      { revokedAt: new Date() },
      { expiresAt: new Date(Date.now() - 1000) },
    ]) {
      prisma.personalAccessToken.findUnique.mockResolvedValue({
        personalAccessTokenId: 1,
        revokedAt: null,
        expiresAt: null,
        lastUsedAt: null,
        user: owner,
        ...state,
      });
      expect(await tokens.authenticate('oat_valid')).toBeNull();
    }
  });

  it('only revokes the caller’s own active tokens', async () => {
    const { tokens, prisma } = setup();
    await tokens.revoke(user, 5);
    expect(prisma.personalAccessToken.updateMany).toHaveBeenCalledWith({
      where: { personalAccessTokenId: 5, userId: 3, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    prisma.personalAccessToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(tokens.revoke(user, 6)).rejects.toThrow('not found');
  });
});

describe('AccessTokenGuard', () => {
  const context = (authorization?: string) => {
    const request: Record<string, unknown> = {
      headers: authorization ? { authorization } : {},
    };
    return {
      request,
      ctx: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };

  it('sets the token owner as the request user', async () => {
    const tokens = { authenticate: jest.fn().mockResolvedValue(owner) };
    const guard = new AccessTokenGuard(
      tokens as unknown as AccessTokensService,
    );
    const { ctx, request } = context('Bearer oat_valid');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual(owner);
  });

  it('rejects missing or invalid tokens', async () => {
    const tokens = { authenticate: jest.fn().mockResolvedValue(null) };
    const guard = new AccessTokenGuard(
      tokens as unknown as AccessTokensService,
    );
    await expect(guard.canActivate(context().ctx)).rejects.toThrow(
      'Invalid or expired',
    );
    await expect(
      guard.canActivate(context('Bearer oat_bad').ctx),
    ).rejects.toThrow('Invalid or expired');
  });

  it('limits each token to 60 requests a minute', async () => {
    const tokens = { authenticate: jest.fn().mockResolvedValue(owner) };
    const guard = new AccessTokenGuard(
      tokens as unknown as AccessTokensService,
    );
    for (let i = 0; i < 60; i++)
      await guard.canActivate(context('Bearer oat_busy').ctx);
    await expect(
      guard.canActivate(context('Bearer oat_busy').ctx),
    ).rejects.toThrow('Too many requests');
  });
});
