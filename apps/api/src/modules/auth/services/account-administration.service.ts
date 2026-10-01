import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChangeAccountMode } from '@openathlete/shared';

import { PrismaService } from '../../prisma/services/prisma.service';
import { AuthUser } from '../decorators/user.decorator';
import { deleteUserData } from './delete-user-data';

export function isAccountAdministrator(
  userId: number,
  configuredIds?: string,
): boolean {
  return !!configuredIds
    ?.split(',')
    .some((id) => /^[1-9]\d*$/.test(id.trim()) && Number(id.trim()) === userId);
}

@Injectable()
export class AccountAdministrationService {
  private readonly logger = new Logger(AccountAdministrationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private authorize(user: AuthUser) {
    if (
      !isAccountAdministrator(
        user.userId,
        this.config.get<string>('ADMIN_USER_IDS'),
      )
    )
      throw new ForbiddenException('Administrator access required');
  }

  async list(user: AuthUser, search: string, page: number) {
    this.authorize(user);
    return this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      select: {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        roles: true,
        onboardingCompleted: true,
      },
      orderBy: { userId: 'asc' },
      skip: page * 25,
      take: 25,
    });
  }

  async change(user: AuthUser, userId: number, input: ChangeAccountMode) {
    this.authorize(user);
    const result = await this.prisma.user.updateMany({
      where: { userId, onboardingCompleted: true },
      data: { roles: input.roles },
    });
    if (result.count !== 1)
      throw new ConflictException(
        'Account must complete onboarding before an administrator changes its mode',
      );
    this.logger.log({
      action: 'account_mode_changed',
      administratorId: user.userId,
      targetUserId: userId,
      roles: input.roles,
    });
    return { success: true };
  }

  /**
   * Permanently deletes another account and all its data in one transaction.
   * Administrators cannot delete themselves or another administrator.
   */
  async delete(user: AuthUser, userId: number) {
    this.authorize(user);
    if (userId === user.userId)
      throw new BadRequestException('Administrators cannot delete themselves');
    if (
      isAccountAdministrator(userId, this.config.get<string>('ADMIN_USER_IDS'))
    )
      throw new BadRequestException('Administrator accounts cannot be deleted');
    const target = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!target) throw new NotFoundException('Account not found');
    await this.prisma.$transaction((tx) => deleteUserData(tx, userId), {
      timeout: 120_000,
      maxWait: 10_000,
    });
    this.logger.log({
      action: 'account_deleted',
      administratorId: user.userId,
      targetUserId: userId,
    });
    return { success: true };
  }
}
