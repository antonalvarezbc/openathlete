import { Injectable, Logger } from '@nestjs/common';

import { AiKeySource } from '@openathlete/database';
import { AiAccessSource, AiFeatureTask, AiUsageDto } from '@openathlete/shared';

import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { AiPolicyService } from './ai-policy.service';

/** Token counts as providers report them; some may leave them out. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** The call a usage belongs to: who paid, for which feature, with which key. */
export interface AiUsageOwner {
  userId: number;
  task: AiFeatureTask;
  source: AiAccessSource;
}

const KEY_SOURCES: Record<AiAccessSource, AiKeySource> = {
  own_key: AiKeySource.OWN_KEY,
  hosted: AiKeySource.HOSTED,
};

/** First day of the month in UTC, the key of the monthly counts. */
export function monthStart(date: Date, monthsLater = 0): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthsLater, 1),
  );
}

const tokens = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;

/**
 * Counts the tokens of every AI call per user and month, and enforces the
 * monthly allowance on the instance keys (AI_HOSTED_MONTHLY_TOKENS).
 *
 * The allowance is checked before a call and counted after it, so calls
 * running at the same time can each go a little over: one call's worth at
 * most, which is fine for a monthly allowance.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AiPolicyService,
  ) {}

  /** Adds a successful call to the month's count. Never fails the call. */
  async record(
    owner: AiUsageOwner,
    usage: TokenUsage | undefined,
    now = new Date(),
  ): Promise<void> {
    const inputTokens = tokens(usage?.inputTokens);
    const outputTokens = tokens(usage?.outputTokens);
    const key = {
      userId: owner.userId,
      month: monthStart(now),
      task: owner.task,
      source: KEY_SOURCES[owner.source],
    };
    try {
      await this.prisma.aiUsage.upsert({
        where: { userId_month_task_source: key },
        create: { ...key, inputTokens, outputTokens, calls: 1 },
        update: {
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
          calls: { increment: 1 },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Could not record AI usage of user ${owner.userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Whether the user may still run calls on the instance keys this month. */
  async hasHostedAllowanceLeft(userId: number, now = new Date()) {
    const limit = this.policy.hostedMonthlyTokens;
    if (limit === undefined) return true;
    const { hostedTokens } = await this.monthTotals(userId, now);
    return hostedTokens < limit;
  }

  async describe(userId: number, now = new Date()): Promise<AiUsageDto> {
    return {
      ...(await this.monthTotals(userId, now)),
      hostedLimit: this.policy.hostedMonthlyTokens ?? null,
      resetsAt: monthStart(now, 1).toISOString(),
    };
  }

  private async monthTotals(userId: number, now: Date) {
    const rows = await this.prisma.aiUsage.groupBy({
      by: ['source'],
      where: { userId, month: monthStart(now) },
      _sum: { inputTokens: true, outputTokens: true },
    });
    const total = (source: AiKeySource) => {
      const row = rows.find((item) => item.source === source);
      return (row?._sum.inputTokens ?? 0) + (row?._sum.outputTokens ?? 0);
    };
    return {
      hostedTokens: total(AiKeySource.HOSTED),
      ownKeyTokens: total(AiKeySource.OWN_KEY),
    };
  }
}
