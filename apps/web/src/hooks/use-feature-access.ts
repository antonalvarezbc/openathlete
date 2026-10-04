import { useCurrentSubscription } from '@/api/subscription';
import { useMemo } from 'react';

import {
  PLAN_CONFIGS,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@openathlete/shared';

/**
 * Check if subscription status is active (active or trialing)
 */
function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.TRIALING
  );
}

/**
 * Hook to get athlete limit information
 */
export function useAthleteLimit() {
  const { data: subscription, isLoading } = useCurrentSubscription();

  const maxAthletes = useMemo(() => {
    if (!subscription) {
      return 3; // Default free plan limit
    }

    // If subscription is not active, return FREE plan limits
    if (!isSubscriptionActive(subscription.status as SubscriptionStatus)) {
      return PLAN_CONFIGS[SubscriptionPlan.FREE].maxAthletes;
    }

    const plan = subscription.plan as SubscriptionPlan;
    const config = PLAN_CONFIGS[plan];
    return config.maxAthletes;
  }, [subscription]);

  // We'll need to fetch current count separately
  // For now, return the limit info
  return {
    maxAthletes,
    isLoading,
    plan: subscription?.plan as SubscriptionPlan | undefined,
    subscription,
  };
}
