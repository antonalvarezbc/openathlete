import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ApiEnvSchemaType } from '@openathlete/shared';

export type HostedAccessPolicy = 'subscribers' | 'everyone' | 'none';

/**
 * Instance-wide AI rules. Without Stripe (self-hosted instances) the operator
 * shares their keys with everyone and may allow local endpoints; with Stripe
 * (the hosted instance) instance keys are a paid feature and the server never
 * calls user-provided URLs.
 */
@Injectable()
export class AiPolicyService {
  constructor(
    private readonly configService: ConfigService<ApiEnvSchemaType, true>,
  ) {}

  private get billingEnabled(): boolean {
    return Boolean(this.configService.get('STRIPE_SECRET_KEY'));
  }

  get hostedAccess(): HostedAccessPolicy {
    return (
      this.configService.get('AI_HOSTED_ACCESS') ??
      (this.billingEnabled ? 'subscribers' : 'everyone')
    );
  }

  /** Monthly tokens per user on the instance keys; undefined: no limit. */
  get hostedMonthlyTokens(): number | undefined {
    return this.configService.get('AI_HOSTED_MONTHLY_TOKENS');
  }

  /** Users may add OpenAI-compatible endpoints and local providers. */
  get customEndpointsAllowed(): boolean {
    return (
      this.configService.get('AI_ALLOW_CUSTOM_ENDPOINTS') ??
      !this.billingEnabled
    );
  }
}
