import { Injectable, Logger } from '@nestjs/common';

import { AiKeySource } from '@openathlete/database';
import { AiAccessSource, AiFeatureTask, AiUsageDto } from '@openathlete/shared';

import { hostedCallCostMicroUsd } from 'src/common/constants/ai-models.constant';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { AiPolicyService } from './ai-policy.service';

/** Token counts as providers report them; some may leave them out. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** The call a usage belongs to: who paid, for which feature, on which model. */
export interface AiUsageOwner {
  userId: number;
  task: AiFeatureTask;
  source: AiAccessSource;
  provider: string;
  modelId: string;
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
 * monthly budget on the instance keys (AI_HOSTED_MONTHLY_BUDGET_USD): calls
 * on the instance keys are charged at their model's price, since output
 * tokens cost several times more than input ones.
 *
 * The budget is checked before a call and charged after it, so calls
 * running at the same time can each go a little over: one call's worth at
 * most, a few hundredths of a cent with the default model.
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
    // Own keys are billed to the user by their provider
    const costMicroUsd =
      owner.source === 'hosted'
        ? hostedCallCostMicroUsd(
            `${owner.provider}/${owner.modelId}`,
            inputTokens,
            outputTokens,
          )
        : 0;
    const key = {
      userId: owner.userId,
      month: monthStart(now),
      task: owner.task,
      source: KEY_SOURCES[owner.source],
    };
    try {
      await this.prisma.aiUsage.upsert({
        where: { userId_month_task_source: key },
        create: { ...key, inputTokens, outputTokens, costMicroUsd, calls: 1 },
        update: {
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
          costMicroUsd: { increment: costMicroUsd },
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
    const budget = this.budgetMicroUsd();
    if (budget === undefined) return true;
    const { hostedCostMicroUsd } = await this.monthTotals(userId, now);
    return hostedCostMicroUsd < budget;
  }

  async describe(userId: number, now = new Date()): Promise<AiUsageDto> {
    const { hostedCostMicroUsd, ...totals } = await this.monthTotals(
      userId,
      now,
    );
    const budget = this.budgetMicroUsd();
    return {
      ...totals,
      hostedBudgetUsed:
        budget === undefined
          ? null
          : budget > 0
            ? Math.min(1, hostedCostMicroUsd / budget)
            : 1,
      resetsAt: monthStart(now, 1).toISOString(),
    };
  }

  private budgetMicroUsd(): number | undefined {
    const budget = this.policy.hostedMonthlyBudgetUsd;
    return budget === undefined ? undefined : Math.round(budget * 1_000_000);
  }

  private async monthTotals(userId: number, now: Date) {
    const rows = await this.prisma.aiUsage.groupBy({
      by: ['source'],
      where: { userId, month: monthStart(now) },
      _sum: { inputTokens: true, outputTokens: true, costMicroUsd: true },
    });
    const total = (source: AiKeySource) => {
      const row = rows.find((item) => item.source === source);
      return (row?._sum.inputTokens ?? 0) + (row?._sum.outputTokens ?? 0);
    };
    return {
      hostedTokens: total(AiKeySource.HOSTED),
      ownKeyTokens: total(AiKeySource.OWN_KEY),
      hostedCostMicroUsd:
        rows.find((item) => item.source === AiKeySource.HOSTED)?._sum
          .costMicroUsd ?? 0,
    };
  }
}
