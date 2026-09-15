import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiEnvSchema, ApiEnvSchemaType } from '@openathlete/shared';

import { PrismaService } from '../../prisma/services/prisma.service';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';

function config(selfHosted: boolean, stripeKey?: string) {
  return new ConfigService({
    SELF_HOSTED: selfHosted,
    STRIPE_SECRET_KEY: stripeKey,
  }) as ConfigService<ApiEnvSchemaType, true>;
}

describe('self-hosted mode', () => {
  it('defaults off and rejects misspelled flag values', () => {
    const base = {
      ENV: 'development',
      NODE_ENV: 'development',
      HASH_PEPPER: 'test',
      JWT_SECRET_KEY: 'x'.repeat(32),
      DATABASE_URL: 'postgresql://localhost/test',
    };
    expect(ApiEnvSchema.parse(base).SELF_HOSTED).toBe(false);
    expect(
      ApiEnvSchema.parse({ ...base, SELF_HOSTED: 'true' }).SELF_HOSTED,
    ).toBe(true);
    expect(
      ApiEnvSchema.safeParse({ ...base, SELF_HOSTED: 'yes' }).success,
    ).toBe(false);
  });

  it('starts without Stripe and rejects billing even with a key configured', async () => {
    for (const key of [undefined, 'sk_test_unused']) {
      const stripe = new StripeService(config(true, key));
      await expect(stripe.getCustomer('customer')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('still requires Stripe in commercial mode', () => {
    expect(() => new StripeService(config(false))).toThrow(
      'STRIPE_SECRET_KEY is not set',
    );
  });

  it('grants AI and unlimited athletes without creating a paid subscription', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ userId: 7 }) },
      subscription: { findUnique: jest.fn(), create: jest.fn() },
    };
    const service = new SubscriptionService(
      prisma as unknown as PrismaService,
      {} as StripeService,
      config(true),
    );
    expect(await service.hasAIFeaturesAccess(7)).toBe(true);
    expect(await service.getMaxAthletesForUser(7)).toBeNull();
    expect(prisma.subscription.create).not.toHaveBeenCalled();
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('does not grant access to missing users', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new SubscriptionService(
      prisma as unknown as PrismaService,
      {} as StripeService,
      config(true),
    );
    await expect(service.hasAIFeaturesAccess(7)).rejects.toThrow();
  });

  it('keeps the paid-plan requirement in commercial mode', async () => {
    const service = new SubscriptionService(
      {} as PrismaService,
      {} as StripeService,
      config(false),
    );
    const lookup = jest.spyOn(service, 'getOrCreateSubscription');
    lookup.mockResolvedValue({ plan: 'FREE', status: 'active' } as never);
    expect(await service.hasAIFeaturesAccess(7)).toBe(false);
    lookup.mockResolvedValue({
      plan: 'ATHLETE_PRO',
      status: 'active',
    } as never);
    expect(await service.hasAIFeaturesAccess(7)).toBe(true);
    lookup.mockResolvedValue({
      plan: 'ATHLETE_PRO',
      status: 'canceled',
    } as never);
    expect(await service.hasAIFeaturesAccess(7)).toBe(false);
  });
});
