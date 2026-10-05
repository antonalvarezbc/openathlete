import { useCurrentSubscription } from '@/api/subscription';

import { SubscriptionPlan } from '@openathlete/shared';

/**
 * How many athletes the user may coach (null: unlimited), as the API decides
 * it: free accounts are limited only on instances that sell subscriptions.
 */
export function useAthleteLimit() {
  const { data: subscription, isLoading } = useCurrentSubscription();

  return {
    maxAthletes: subscription?.maxAthletes ?? null,
    isLoading,
    plan: subscription?.plan as SubscriptionPlan | undefined,
    subscription,
  };
}
