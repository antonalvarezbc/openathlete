import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  AI_FEATURE_TASKS,
  AiAccessDto,
  AiAccessSource,
  AiFeatureTask,
  AiTask,
  AiTaskAccessDto,
  CUSTOM_AI_PROVIDER,
} from '@openathlete/shared';

import { hostedModelFor } from 'src/common/constants/ai-models.constant';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';
import { SubscriptionService } from 'src/modules/subscription/services/subscription.service';

import {
  AiHostedQuotaExceededException,
  AiNotConfiguredException,
} from '../ai.errors';
import { AiCredentialCipher } from './ai-credential-cipher';
import { AiPolicyService } from './ai-policy.service';
import { AiProviderCatalogService } from './ai-provider-catalog.service';
import { AiUsageService } from './ai-usage.service';

export const AI_CREDENTIAL_CIPHER = Symbol('AI_CREDENTIAL_CIPHER');
export const AI_ENV = Symbol('AI_ENV');

/** How Mastra reaches the model, with the key the call is billed to. */
export type AiModelConfig =
  | { id: `${string}/${string}`; apiKey: string; url?: string }
  | { providerId: string; modelId: string; url: string; apiKey: string };

export interface ResolvedAiModel {
  task: AiFeatureTask;
  source: AiAccessSource;
  /** User whose key or plan pays for the call */
  userId: number;
  provider: string;
  modelId: string;
  /** Set when the call runs on a user's own key */
  credentialId: number | null;
  config: AiModelConfig;
}

/** Placeholder for endpoints that need no key (local Ollama, LM Studio). */
const NO_API_KEY = 'not-needed';

/**
 * Decides which model and key run an AI feature:
 * 1. the model the user chose for the task (or their default), on their key;
 * 2. otherwise the instance keys, when their plan or the instance policy
 *    allows it (AI_HOSTED_ACCESS) and their monthly budget is not used up
 *    (AI_HOSTED_MONTHLY_BUDGET_USD);
 * Work done on an athlete's data (feedback questions, analysis, load
 * estimation) runs on the athlete's own access only, never on a coach's key.
 */
@Injectable()
export class AiModelResolverService {
  private readonly logger = new Logger(AiModelResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AiPolicyService,
    private readonly catalog: AiProviderCatalogService,
    private readonly subscriptionService: SubscriptionService,
    private readonly usage: AiUsageService,
    @Inject(AI_CREDENTIAL_CIPHER) private readonly cipher: AiCredentialCipher,
    @Inject(AI_ENV) private readonly env: Record<string, string | undefined>,
  ) {}

  /** For a feature the user triggers. Throws when no model is available. */
  async resolveForUser(
    task: AiFeatureTask,
    userId: number,
  ): Promise<ResolvedAiModel> {
    const resolved = await this.tryResolveForUser(task, userId);
    if (resolved) return resolved;
    if (
      this.resolveHosted(task, userId) &&
      (await this.hasHostedAccess(userId))
    ) {
      // Hosted AI would run it: only the allowance is missing
      throw new AiHostedQuotaExceededException();
    }
    throw new AiNotConfiguredException(task);
  }

  /**
   * For background work on an athlete's data: the athlete's own key, or the
   * instance keys when their plan allows it. Coaches' keys are never used.
   * Returns null when the athlete has no AI for the task.
   */
  async tryResolveForAthlete(
    task: AiFeatureTask,
    athleteId: number,
  ): Promise<ResolvedAiModel | null> {
    const userId = await this.athleteUserId(athleteId);
    if (userId === null) return null;
    return this.tryResolveForUser(task, userId);
  }

  async tryResolveForUser(
    task: AiFeatureTask,
    userId: number,
  ): Promise<ResolvedAiModel | null> {
    const ownKey = await this.resolveOwnKey(task, userId);
    if (ownKey) return ownKey;
    if (!(await this.hasHostedAccess(userId))) return null;
    const hosted = this.resolveHosted(task, userId);
    if (!hosted || !(await this.usage.hasHostedAllowanceLeft(userId))) {
      return null;
    }
    return hosted;
  }

  async hasHostedAccess(userId: number): Promise<boolean> {
    switch (this.policy.hostedAccess) {
      case 'everyone':
        return true;
      case 'none':
        return false;
      case 'subscribers':
        return this.subscriptionService.hasAIFeaturesAccess(userId);
    }
  }

  /**
   * What each feature would run on for the user. Background features use
   * the athlete's own access when an athlete is given.
   */
  async describeAccess(
    userId: number,
    athleteId?: number,
  ): Promise<AiAccessDto> {
    const backgroundTasks: AiFeatureTask[] = [
      AiTask.POST_ACTIVITY_QUESTIONS,
      AiTask.FEEDBACK_EXTRACTION,
      AiTask.TRAINING_LOAD_ESTIMATION,
    ];
    const entries = await Promise.all(
      AI_FEATURE_TASKS.map(async (task) => {
        const resolved =
          athleteId !== undefined && backgroundTasks.includes(task)
            ? await this.tryResolveForAthlete(task, athleteId)
            : await this.tryResolveForUser(task, userId);
        const access: AiTaskAccessDto = resolved
          ? {
              available: true,
              source: resolved.source,
              provider: resolved.provider,
              modelId: resolved.modelId,
            }
          : { available: false, source: null, provider: null, modelId: null };
        return [task, access] as const;
      }),
    );
    // Only worth mentioning when the instance has keys at all
    const instanceHasKeys = AI_FEATURE_TASKS.some(
      (task) => this.resolveHosted(task, userId) !== null,
    );
    const allowed = await this.hasHostedAccess(userId);
    const hostedAvailable = allowed && instanceHasKeys;
    return {
      tasks: Object.fromEntries(entries) as AiAccessDto['tasks'],
      hostedAccess: hostedAvailable,
      upgradeUnlocksHosted:
        !allowed &&
        instanceHasKeys &&
        this.policy.hostedAccess === 'subscribers',
      customEndpointsAllowed: this.policy.customEndpointsAllowed,
      hostedQuotaExhausted:
        hostedAvailable && !(await this.usage.hasHostedAllowanceLeft(userId)),
      usage: await this.usage.describe(userId),
    };
  }

  /** Builds the Mastra model config of a credential (also used to test it). */
  modelConfig(
    credential: {
      provider: string;
      encryptedApiKey: string;
      baseUrl: string | null;
    },
    modelId: string,
  ): AiModelConfig {
    const apiKey =
      this.cipher.decrypt(credential.encryptedApiKey) || NO_API_KEY;
    if (credential.provider === CUSTOM_AI_PROVIDER) {
      return {
        providerId: CUSTOM_AI_PROVIDER,
        modelId,
        url: credential.baseUrl ?? '',
        apiKey,
      };
    }
    return {
      id: `${credential.provider}/${modelId}`,
      apiKey,
      ...(credential.baseUrl ? { url: credential.baseUrl } : {}),
    };
  }

  private async resolveOwnKey(
    task: AiFeatureTask,
    userId: number,
  ): Promise<ResolvedAiModel | null> {
    const preferences = await this.prisma.aiModelPreference.findMany({
      where: { userId, task: { in: [task, AiTask.DEFAULT] } },
      include: { credential: true },
    });
    const preference =
      preferences.find((item) => item.task === task) ??
      preferences.find((item) => item.task === AiTask.DEFAULT);
    if (!preference) return null;

    const { credential } = preference;
    if (
      !this.catalog.isAvailable(credential.provider) ||
      (credential.baseUrl && !this.policy.customEndpointsAllowed)
    ) {
      // e.g. a local endpoint once the instance disallows them
      return null;
    }
    try {
      return {
        task,
        source: 'own_key',
        userId,
        provider: credential.provider,
        modelId: preference.modelId,
        credentialId: credential.aiCredentialId,
        config: this.modelConfig(credential, preference.modelId),
      };
    } catch (error) {
      this.logger.error(
        `AI credential ${credential.aiCredentialId} cannot be decrypted (was HASH_PEPPER changed?): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private resolveHosted(
    task: AiFeatureTask,
    userId: number,
  ): ResolvedAiModel | null {
    let model = hostedModelFor(task, this.env);
    // Older configurations name OpenAI models without their provider
    if (!model.includes('/')) model = `openai/${model}`;
    const separator = model.indexOf('/');
    const provider = model.slice(0, separator);
    const modelId = model.slice(separator + 1);
    const apiKey = this.catalog
      .apiKeyEnvVars(provider)
      .map((name) => this.env[name])
      .find(Boolean);
    if (!apiKey) return null;

    return {
      task,
      source: 'hosted',
      userId,
      provider,
      modelId,
      credentialId: null,
      config: { id: `${provider}/${modelId}`, apiKey },
    };
  }

  private async athleteUserId(athleteId: number): Promise<number | null> {
    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
      select: { userId: true },
    });
    return athlete?.userId ?? null;
  }
}
