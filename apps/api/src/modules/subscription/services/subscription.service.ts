import Stripe from 'stripe';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
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
   * Create subscription from Stripe checkout
   */
  async createSubscriptionFromCheckout(
    userId: number,
    customerId: string,
    subscriptionId: string,
    plan: SubscriptionPlan,
  ): Promise<Subscription> {
    await this.assertUserExistsForSubscription(userId);

    const stripeSubscription =
      await this.stripeService.getSubscription(subscriptionId);
    if (!stripeSubscription) {
      throw new NotFoundException('Stripe subscription not found');
    }

    const stripeSub = stripeSubscription as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
      trial_end?: number | null;
    };

    // Check if subscription already exists
    const existing = await this.prisma.subscription.findUnique({
      where: { userId: userId },
    });

    const currentPeriodStart =
      stripeSub.current_period_start != null
        ? new Date(stripeSub.current_period_start * 1000)
        : new Date();

    const currentPeriodEnd =
      stripeSub.current_period_end != null
        ? new Date(stripeSub.current_period_end * 1000)
        : new Date();

    const trialEnd =
      stripeSub.trial_end != null ? new Date(stripeSub.trial_end * 1000) : null;

    const subscriptionData = {
      plan: this.mapPlanToPrisma(plan),
      status: this.mapStatusToPrisma(stripeSubscription.status),
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      trialEnd,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end ?? false,
    };

    if (existing) {
      return await this.prisma.subscription.update({
        where: { subscriptionId: existing.subscriptionId },
        data: subscriptionData,
      });
    }

    return await this.prisma.subscription.create({
      data: {
        userId,
        ...subscriptionData,
      },
    });
  }

  /**
   * Update subscription from Stripe webhook
   */
  async updateSubscriptionFromWebhook(
    stripeSubscription: Stripe.Subscription,
  ): Promise<Subscription> {
    const stripeSub = stripeSubscription as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
      trial_end?: number | null;
    };

    let subscription = await this.prisma.subscription.findUnique({
      where: {
        stripeSubscriptionId: stripeSubscription.id,
      },
    });

    // If subscription doesn't exist yet (webhook arrived before checkout.session.completed),
    // create it from the Stripe subscription data
    if (!subscription) {
      this.logger.warn(
        `Subscription not found for Stripe subscription ID: ${stripeSubscription.id}, creating from webhook`,
      );

      // Get customer to find user_id
      const customer = await this.stripeService.getCustomer(
        stripeSubscription.customer as string,
      );

      if (customer.deleted || !('metadata' in customer)) {
        throw new NotFoundException('Customer not found');
      }

      const userId = customer.metadata?.userId;
      if (!userId) {
        throw new NotFoundException('User ID not found in customer metadata');
      }

      const plan =
        (stripeSubscription.metadata?.plan as SubscriptionPlan | undefined) ||
        SubscriptionPlan.FREE;

      subscription = await this.createSubscriptionFromCheckout(
        Number.parseInt(userId, 10),
        stripeSubscription.customer as string,
        stripeSubscription.id,
        plan,
      );
    }

    this.logger.log(
      `Fetching full subscription ${stripeSubscription.id} to extract plan from price ID (source of truth)`,
    );
    const fullSubscription = await this.stripeService.getSubscription(
      stripeSubscription.id,
    );

    let plan: SubscriptionPlan;

    if (!fullSubscription) {
      this.logger.error(
        `Failed to fetch subscription ${stripeSubscription.id} from Stripe`,
      );
      // Fallback: try metadata if available, otherwise use existing plan
      if (stripeSubscription.metadata?.plan) {
        plan = stripeSubscription.metadata.plan as SubscriptionPlan;
        this.logger.warn(
          `Using metadata plan ${plan} as fallback (subscription fetch failed)`,
        );
      } else {
        plan = subscription.plan
          ? this.mapPrismaPlanToEnum(subscription.plan)
          : SubscriptionPlan.FREE;
        this.logger.warn(
          `Using existing plan ${plan} as fallback (subscription fetch failed and no metadata)`,
        );
      }
    } else {
      const priceId = fullSubscription.items?.data?.[0]?.price?.id;
      if (priceId) {
        this.logger.log(
          `Extracting plan from price ID: ${priceId} for subscription ${stripeSubscription.id}`,
        );
        plan = this.stripeService.getPlanFromPriceId(priceId);
        this.logger.log(
          `Plan extracted from price ID ${priceId}: ${plan} for subscription ${stripeSubscription.id}`,
        );
        // Log if metadata differs from price ID (indicates stale metadata)
        if (
          stripeSubscription.metadata?.plan &&
          stripeSubscription.metadata.plan !== plan
        ) {
          this.logger.warn(
            `Metadata plan (${stripeSubscription.metadata.plan}) differs from price ID plan (${plan}). Using price ID as source of truth.`,
          );
        }
      } else {
        // Fallback: try metadata if available, otherwise use existing plan
        if (stripeSubscription.metadata?.plan) {
          plan = stripeSubscription.metadata.plan as SubscriptionPlan;
          this.logger.warn(
            `Using metadata plan ${plan} as fallback (price ID not found)`,
          );
        } else {
          plan = subscription.plan
            ? this.mapPrismaPlanToEnum(subscription.plan)
            : SubscriptionPlan.FREE;
          this.logger.warn(
            `Could not extract plan from subscription ${stripeSubscription.id}. Price ID: ${priceId}, Items: ${JSON.stringify(fullSubscription.items?.data?.map((item) => ({ id: item.id, priceId: item.price?.id })))}. Using existing plan: ${plan}`,
          );
        }
      }
    }

    // Safely extract period dates from Stripe subscription
    const currentPeriodStart =
      stripeSub.current_period_start != null
        ? new Date(stripeSub.current_period_start * 1000)
        : subscription.currentPeriodStart || new Date();

    const currentPeriodEnd =
      stripeSub.current_period_end != null
        ? new Date(stripeSub.current_period_end * 1000)
        : subscription.currentPeriodEnd || new Date();

    const trialEnd =
      stripeSub.trial_end != null ? new Date(stripeSub.trial_end * 1000) : null;

    return await this.prisma.subscription.update({
      where: { subscriptionId: subscription.subscriptionId },
      data: {
        plan: this.mapPlanToPrisma(plan),
        status: this.mapStatusToPrisma(stripeSubscription.status),
        currentPeriodStart: currentPeriodStart,
        currentPeriodEnd: currentPeriodEnd,
        trialEnd: trialEnd,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end ?? false,
      },
    });
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

    const currentCount = await this.prisma.coachAthlete.count({
      where: { userId: userId },
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
      where: { userId: userId },
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

  /**
   * Map SubscriptionPlan enum to Prisma enum
   */
  private mapPlanToPrisma(plan: SubscriptionPlan): PrismaSubscriptionPlan {
    switch (plan) {
      case SubscriptionPlan.FREE:
        return PrismaSubscriptionPlan.FREE;
      case SubscriptionPlan.ATHLETE_PRO:
        return PrismaSubscriptionPlan.ATHLETE_PRO;
      case SubscriptionPlan.COACH_PRO:
        return PrismaSubscriptionPlan.COACH_PRO;
      case SubscriptionPlan.COACH_ULTRA:
        return PrismaSubscriptionPlan.COACH_ULTRA;
      case SubscriptionPlan.CLUB_PRO:
        return PrismaSubscriptionPlan.CLUB_PRO;
      case SubscriptionPlan.CLUB_ULTRA:
        return PrismaSubscriptionPlan.CLUB_ULTRA;
    }
  }

  /**
   * Map Prisma enum to SubscriptionPlan enum
   */
  private mapPrismaPlanToEnum(plan: PrismaSubscriptionPlan): SubscriptionPlan {
    switch (plan) {
      case PrismaSubscriptionPlan.FREE:
        return SubscriptionPlan.FREE;
      case PrismaSubscriptionPlan.ATHLETE_PRO:
        return SubscriptionPlan.ATHLETE_PRO;
      case PrismaSubscriptionPlan.COACH_PRO:
        return SubscriptionPlan.COACH_PRO;
      case PrismaSubscriptionPlan.COACH_ULTRA:
        return SubscriptionPlan.COACH_ULTRA;
      case PrismaSubscriptionPlan.CLUB_PRO:
        return SubscriptionPlan.CLUB_PRO;
      case PrismaSubscriptionPlan.CLUB_ULTRA:
        return SubscriptionPlan.CLUB_ULTRA;
    }
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
