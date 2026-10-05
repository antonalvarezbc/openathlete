import { m } from '@/paraglide/messages';

import {
  BillingInterval,
  PLAN_CONFIGS,
  SubscriptionPlan,
} from '@openathlete/shared';

const SUPPORTER_PRICES = PLAN_CONFIGS[SubscriptionPlan.SUPPORTER].prices!;

/** A Supporter price, e.g. "€5/month" or "50 €/an". */
export function supporterPriceLabel(interval: BillingInterval): string {
  const price = SUPPORTER_PRICES[interval];
  return interval === BillingInterval.YEAR
    ? m.supporter_price_year({ price })
    : m.supporter_price_month({ price });
}
