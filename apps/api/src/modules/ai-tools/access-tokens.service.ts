import { createHash, randomBytes } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuthUser } from '../auth/decorators/user.decorator';
import { PrismaService } from '../prisma/services/prisma.service';

export const ACCESS_TOKEN_PREFIX = 'oat_';
const MAX_ACTIVE_TOKENS = 10;
const LAST_USED_RESOLUTION_MS = 60_000;

export const hashAccessToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/**
 * Personal access tokens for the MCP server. Tokens are random, shown once,
 * stored as SHA-256 hashes, revocable and optionally expiring.
 */
@Injectable()
export class AccessTokensService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.personalAccessToken.findMany({
      where: { userId: user.userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        personalAccessTokenId: true,
        name: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
  }

  async create(user: AuthUser, name: string, expiresInDays: number | null) {
    const active = await this.prisma.personalAccessToken.count({
      where: { userId: user.userId, revokedAt: null },
    });
    if (active >= MAX_ACTIVE_TOKENS)
      throw new ConflictException(
        `Revoke a token first (maximum ${MAX_ACTIVE_TOKENS})`,
      );
    const token = ACCESS_TOKEN_PREFIX + randomBytes(30).toString('base64url');
    const created = await this.prisma.personalAccessToken.create({
      data: {
        userId: user.userId,
        name,
        tokenHash: hashAccessToken(token),
        prefix: token.slice(0, 12),
        expiresAt: expiresInDays
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
          : null,
      },
      select: {
        personalAccessTokenId: true,
        name: true,
        prefix: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    // The only time the token is returned.
    return { ...created, token };
  }

  async revoke(user: AuthUser, personalAccessTokenId: number) {
    const result = await this.prisma.personalAccessToken.updateMany({
      where: { personalAccessTokenId, userId: user.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Token not found');
    return { success: true };
  }

  /** The user behind a valid token, in the same shape as JWT authentication. */
  async authenticate(token: string): Promise<AuthUser | null> {
    if (!token.startsWith(ACCESS_TOKEN_PREFIX) || token.length > 200)
      return null;
    const record = await this.prisma.personalAccessToken.findUnique({
      where: { tokenHash: hashAccessToken(token) },
      select: {
        personalAccessTokenId: true,
        revokedAt: true,
        expiresAt: true,
        lastUsedAt: true,
        user: {
          select: {
            userId: true,
            email: true,
            roles: true,
            athlete: { select: { athleteId: true } },
            coachAthletes: { select: { athleteId: true } },
          },
        },
      },
    });
    if (!record || record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt.getTime() < Date.now())
      return null;
    if (
      !record.lastUsedAt ||
      Date.now() - record.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
    )
      await this.prisma.personalAccessToken.update({
        where: { personalAccessTokenId: record.personalAccessTokenId },
        data: { lastUsedAt: new Date() },
      });
    return record.user;
  }
}
