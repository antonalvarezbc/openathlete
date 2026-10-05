import { useCreateCheckout } from '@/api/subscription';
import { IOSPaymentBlockDialog } from '@/components/payment/ios-payment-block-dialog';
import { m } from '@/paraglide/messages';
import {
  AnalyticsEvent,
  analyticsErrorCodeFromUnknown,
} from '@/utils/analytics-events';
import { isPaymentDisabled } from '@/utils/capacitor';
import { cn } from '@/utils/shadcn';
import { supporterPriceLabel } from '@/utils/supporter';
import { Check } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  BillingInterval,
  FREE_PLAN_MAX_ATHLETES,
  SubscriptionPlan,
} from '@openathlete/shared';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { SparklesIcon } from '../ui/sparkles-icon';

/**
 * The Supporter subscription: what it adds to the free plan, monthly or
 * yearly, and the button to Stripe checkout.
 */
export function SupporterOffer({
  analyticsSource,
  className,
}: {
  /** Where the offer was shown (PostHog) */
  analyticsSource: string;
  className?: string;
}) {
  const posthog = usePostHog();
  const createCheckout = useCreateCheckout();
  const [interval, setInterval] = useState(BillingInterval.YEAR);
  const [showIOSPaymentBlock, setShowIOSPaymentBlock] = useState(false);

  const subscribe = async () => {
    if (isPaymentDisabled()) {
      setShowIOSPaymentBlock(true);
      return;
    }
    const settingsUrl = `${window.location.origin}/dashboard/settings?tab=subscription`;
    try {
      const { url } = await createCheckout.mutateAsync({
        interval,
        successUrl: `${settingsUrl}&success=true`,
        cancelUrl: `${settingsUrl}&canceled=true`,
      });
      posthog?.capture('subscription_upgrade_initiated', {
        plan: SubscriptionPlan.SUPPORTER,
        interval,
        source: analyticsSource,
      });
      window.location.href = url;
    } catch (error) {
      posthog?.capture(AnalyticsEvent.subscription_checkout_failed, {
        plan: SubscriptionPlan.SUPPORTER,
        interval,
        source: analyticsSource,
        error_code: analyticsErrorCodeFromUnknown(error),
      });
      toast.error(m.subscription_checkout_error());
    }
  };

  const perks = [
    m.supporter_perk_athletes({ count: FREE_PLAN_MAX_ATHLETES }),
    m.supporter_perk_ai(),
    m.supporter_perk_project(),
  ];

  return (
    <div className={cn('space-y-5 rounded-lg border p-5', className)}>
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-5 text-primary" />
        <h3 className="text-lg font-semibold">{m.plan_supporter_name()}</h3>
      </div>

      <div
        role="radiogroup"
        aria-label={m.supporter_interval_label()}
        className="grid grid-cols-2 gap-2"
      >
        {[BillingInterval.MONTH, BillingInterval.YEAR].map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={interval === option}
            onClick={() => setInterval(option)}
            className={cn(
              'flex min-h-11 flex-col items-start rounded-md border px-3 py-2 text-left text-sm transition-colors',
              interval === option
                ? 'border-primary bg-primary/5'
                : 'hover:bg-muted',
            )}
          >
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {option === BillingInterval.YEAR
                ? m.supporter_interval_yearly()
                : m.supporter_interval_monthly()}
              {option === BillingInterval.YEAR && (
                <Badge variant="secondary">{m.supporter_yearly_saving()}</Badge>
              )}
            </span>
            <span className="text-muted-foreground">
              {supporterPriceLabel(option)}
            </span>
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-green-600" />
            <span>{perk}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <Button
          className="h-11 w-full"
          onClick={subscribe}
          disabled={createCheckout.isPending}
        >
          {createCheckout.isPending ? m.loading() : m.supporter_cta()}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {m.supporter_no_commitment()}
        </p>
      </div>

      <IOSPaymentBlockDialog
        open={showIOSPaymentBlock}
        onOpenChange={setShowIOSPaymentBlock}
      />
    </div>
  );
}
