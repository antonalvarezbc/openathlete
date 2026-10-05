import Stripe from 'stripe';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  BillingInterval as PrismaBillingInterval,
  SubscriptionPlan as PrismaSubscriptionPlan,
  Subscription,
  SubscriptionStatus,
} from '@openathlete/database';
import {
  ApiEnvSchemaType,
  SubscriptionPlan,
  getMaxAthletes,
  planHasAIFeatures,
} from '@openathlete/shared';

import { otherAthleteLinks } from '../../core/helpers/self-coaching';
import { PrismaService } from '../../prisma/services/prisma.service';
import { StripeService } from './stripe.service';

export class SubscriptionUserMissingError extends Error {
  constructor(public readonly userId: number) {
    super(`User ${userId} does not exist`);
    this.name = 'SubscriptionUserMissingError';
  }
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService<ApiEnvSchemaType, true>,
  ) {}

  /**
   * Ensure a Stripe customer exists for this user and persist its ID.
   * Useful for flows like opening the billing portal when the user never checked out yet.
   */
  async getOrCreateStripeCustomerId(userId: number): Promise<string> {
    const subscription = await this.getOrCreateSubscription(userId);

    if (subscription.stripeCustomerId) {
      return subscription.stripeCustomerId;
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const customer = await this.stripeService.getOrCreateCustomer(
      userId,
      user.email,
    );

    const updated = await this.prisma.subscription.update({
      where: { subscriptionId: subscription.subscriptionId },
      data: { stripeCustomerId: customer.id },
    });

    // `customer.id` is always defined; this is just defensive.
    return updated.stripeCustomerId ?? customer.id;
  }

  /**
   * Get current subscription for a user
   */
  async getCurrentSubscription(userId: number): Promise<Subscription | null> {
    return await this.prisma.subscription.findUnique({
      where: { userId: userId },
    });
  }

  /**
   * Get or create subscription (defaults to FREE)
   */
  async getOrCreateSubscription(userId: number): Promise<Subscription> {
    try {
      await this.assertUserExistsForSubscription(userId);
    } catch (e) {
      if (e instanceof SubscriptionUserMissingError) {
        throw new NotFoundException('User not found');
      }
      throw e;
    }

    let subscription = await this.getCurrentSubscription(userId);

    if (!subscription) {
      // Create free subscription by default
      subscription = await this.prisma.subscription.create({
        data: {
          userId: userId,
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.active,
        },
      });
    }

    return subscription;
  }

  /**
   * Stores a Stripe subscription for a user, after checkout or from a
   * webhook. Every Stripe subscription is a Supporter one; whether it gives
   * access depends on its status.
   */
  async saveStripeSubscription(
    userId: number,
    customerId: string,
    stripeSubscription: Stripe.Subscription,
  ): Promise<Subscription> {
    await this.assertUserExistsForSubscription(userId);

    const data = {
      ...this.fieldsFromStripe(stripeSubscription),
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSubscription.id,
    };
    return await this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  /**
   * Create subscription from Stripe checkout
   */
  async createSubscriptionFromCheckout(
    userId: number,
    customerId: string,
    subscriptionId: string,
  ): Promise<Subscription> {
    const stripeSubscription =
      await this.stripeService.getSubscription(subscriptionId);
    if (!stripeSubscription) {
      throw new NotFoundException('Stripe subscription not found');
    }
    return this.saveStripeSubscription(userId, customerId, stripeSubscription);
  }

  /**
   * Update subscription from Stripe webhook
   */
  async updateSubscriptionFromWebhook(
    stripeSubscription: Stripe.Subscription,
  ): Promise<Subscription> {
    const existing = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });
    if (existing) {
      return await this.prisma.subscription.update({
        where: { subscriptionId: existing.subscriptionId },
        data: this.fieldsFromStripe(stripeSubscription),
      });
    }

    // The webhook can arrive before checkout.session.completed: find the
    // user from the customer
    this.logger.warn(
      `Subscription not found for Stripe subscription ID: ${stripeSubscription.id}, creating from webhook`,
    );
    const customerId = stripeSubscription.customer as string;
    const customer = await this.stripeService.getCustomer(customerId);
    const userId = customer.metadata?.userId;
    if (!userId) {
      throw new NotFoundException('User ID not found in customer metadata');
    }
    return this.saveStripeSubscription(
      Number.parseInt(userId, 10),
      customerId,
      stripeSubscription,
    );
  }

  private fieldsFromStripe(stripeSubscription: Stripe.Subscription) {
    // Billing periods moved to subscription items in recent API versions
    const stripeSub = stripeSubscription as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };
    const item = stripeSubscription.items?.data?.[0] as
      | (Stripe.SubscriptionItem & {
          current_period_start?: number;
          current_period_end?: number;
        })
      | undefined;
    const date = (seconds: number | null | undefined) =>
      seconds != null ? new Date(seconds * 1000) : null;
    return {
      plan: PrismaSubscriptionPlan.SUPPORTER,
      billingInterval: this.billingIntervalOf(stripeSubscription),
      status: this.mapStatusToPrisma(stripeSubscription.status),
      currentPeriodStart: date(
        stripeSub.current_period_start ?? item?.current_period_start,
      ),
      currentPeriodEnd: date(
        stripeSub.current_period_end ?? item?.current_period_end,
      ),
      trialEnd: date(stripeSubscription.trial_end),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end ?? false,
    };
  }

  private billingIntervalOf(
    stripeSubscription: Stripe.Subscription,
  ): PrismaBillingInterval | null {
    const price = stripeSubscription.items?.data?.[0]?.price;
    const interval =
      this.stripeService.intervalOfPrice(price?.id) ??
      price?.recurring?.interval;
    switch (interval) {
      case 'month':
        return PrismaBillingInterval.month;
      case 'year':
        return PrismaBillingInterval.year;
      default:
        return null;
    }
  }

  /**
   * Cancel subscription (at period end)
   */
  async cancelSubscription(userId: number): Promise<Subscription> {
    const subscription = await this.getCurrentSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.stripeSubscriptionId) {
      throw new NotFoundException('Stripe subscription ID not found');
    }

    await this.stripeService.cancelSubscriptionAtPeriodEnd(
      subscription.stripeSubscriptionId,
    );

    return await this.prisma.subscription.update({
      where: { subscriptionId: subscription.subscriptionId },
      data: {
        cancelAtPeriodEnd: true,
      },
    });
  }

  /**
   * Resume subscription
   */
  async resumeSubscription(userId: number): Promise<Subscription> {
    const subscription = await this.getCurrentSubscription(userId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.stripeSubscriptionId) {
      throw new NotFoundException('Stripe subscription ID not found');
    }

    await this.stripeService.resumeSubscription(
      subscription.stripeSubscriptionId,
    );

    return await this.prisma.subscription.update({
      where: { subscriptionId: subscription.subscriptionId },
      data: {
        cancelAtPeriodEnd: false,
      },
    });
  }

  /**
   * Get max athletes for a user's plan
   */
  async getMaxAthletesForUser(userId: number): Promise<number | null> {
    if (this.configService.get('SELF_HOSTED') === true) {
      await this.assertUserExistsForSubscription(userId);
      return null;
    }
    // Nothing is sold without billing, so nothing is limited
    if (!this.stripeService.billingEnabled) return null;

    const subscription = await this.getOrCreateSubscription(userId);

    if (!this.isSubscriptionActive(subscription.status)) {
      return getMaxAthletes(SubscriptionPlan.FREE);
    }

    const plan = this.mapPrismaPlanToEnum(subscription.plan);
    return getMaxAthletes(plan);
  }

  /**
   * Check if user can add more athletes
   */
  async canAddAthlete(userId: number): Promise<boolean> {
    const maxAthletes = await this.getMaxAthletesForUser(userId);
    if (maxAthletes === null) {
      return true; // Unlimited
    }

    // Coaching yourself does not use an athlete slot.
    const currentCount = await this.prisma.coachAthlete.count({
      where: otherAthleteLinks(userId),
    });

    return currentCount < maxAthletes;
  }

  private isSubscriptionActive(status: SubscriptionStatus): boolean {
    return (
      status === SubscriptionStatus.active ||
      status === SubscriptionStatus.trialing
    );
  }

  /**
   * Check if user has access to AI features
   */
  async hasAIFeaturesAccess(userId: number): Promise<boolean> {
    if (this.configService.get('SELF_HOSTED') === true) {
      await this.assertUserExistsForSubscription(userId);
      return true;
    }
    const subscription = await this.getOrCreateSubscription(userId);

    if (!this.isSubscriptionActive(subscription.status)) {
      return false;
    }

    const plan = this.mapPrismaPlanToEnum(subscription.plan);
    return planHasAIFeatures(plan);
  }

  /**
   * Check if user is over athlete limit (for downgrade handling)
   */
  async isOverAthleteLimit(userId: number): Promise<boolean> {
    const maxAthletes = await this.getMaxAthletesForUser(userId);
    if (maxAthletes === null) {
      return false; // Unlimited
    }

    const currentCount = await this.prisma.coachAthlete.count({
      where: otherAthleteLinks(userId),
    });

    return currentCount > maxAthletes;
  }

  /**
   * Map Stripe subscription status to Prisma enum
   */
  private mapStatusToPrisma(
    status: Stripe.Subscription.Status,
  ): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.active;
      case 'canceled':
        return SubscriptionStatus.canceled;
      case 'past_due':
        return SubscriptionStatus.past_due;
      case 'trialing':
        return SubscriptionStatus.trialing;
      case 'incomplete':
        return SubscriptionStatus.incomplete;
      case 'incomplete_expired':
        return SubscriptionStatus.incomplete_expired;
      case 'unpaid':
        return SubscriptionStatus.unpaid;
      default:
        return SubscriptionStatus.active;
    }
  }

  private mapPrismaPlanToEnum(plan: PrismaSubscriptionPlan): SubscriptionPlan {
    return plan === PrismaSubscriptionPlan.SUPPORTER
      ? SubscriptionPlan.SUPPORTER
      : SubscriptionPlan.FREE;
  }

  private async assertUserExistsForSubscription(userId: number): Promise<void> {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user id');
    }

    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { userId: true },
    });

    if (!user) {
      throw new SubscriptionUserMissingError(userId);
    }
  }
}
