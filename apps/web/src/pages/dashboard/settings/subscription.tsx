import {
  useCancelSubscription,
  useCreateCheckout,
  useCurrentSubscription,
  useCustomerPortal,
  useInvoices,
  useResumeSubscription,
} from '@/api/subscription';
import { IOSPaymentBlockDialog } from '@/components/payment/ios-payment-block-dialog';
import { PlanCard } from '@/components/paywall/plan-card';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { m } from '@/paraglide/messages';
import {
  AnalyticsEvent,
  analyticsErrorCodeFromUnknown,
} from '@/utils/analytics-events';
import { isPaymentDisabled } from '@/utils/capacitor';
import { format } from 'date-fns';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  PLAN_CONFIGS,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@openathlete/shared';

const planNameMap: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: m.plan_free_name(),
  [SubscriptionPlan.ATHLETE_PRO]: m.plan_athlete_pro_name(),
  [SubscriptionPlan.COACH_PRO]: m.plan_coach_pro_name(),
  [SubscriptionPlan.COACH_ULTRA]: m.plan_coach_ultra_name(),
  [SubscriptionPlan.CLUB_PRO]: m.plan_club_pro_name(),
  [SubscriptionPlan.CLUB_ULTRA]: m.plan_club_ultra_name(),
};

const subscriptionStatusMap: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.ACTIVE]: m.subscription_status_active(),
  [SubscriptionStatus.TRIALING]: m.subscription_status_trialing(),
  [SubscriptionStatus.CANCELED]: m.subscription_status_canceled(),
  [SubscriptionStatus.PAST_DUE]: m.subscription_status_past_due(),
  [SubscriptionStatus.INCOMPLETE]: m.subscription_status_incomplete(),
  [SubscriptionStatus.INCOMPLETE_EXPIRED]:
    m.subscription_status_incomplete_expired(),
  [SubscriptionStatus.UNPAID]: m.subscription_status_unpaid(),
};

const invoiceStatusMap: Record<string, string> = {
  paid: m.invoice_status_paid(),
  open: m.invoice_status_open(),
  draft: m.invoice_status_draft(),
  void: m.invoice_status_void(),
  uncollectible: m.invoice_status_uncollectible(),
};

// Group plans by category (paid plans only)
const ATHLETE_PLANS = [SubscriptionPlan.ATHLETE_PRO];
const COACH_PLANS = [SubscriptionPlan.COACH_PRO, SubscriptionPlan.COACH_ULTRA];
const CLUB_PLANS = [SubscriptionPlan.CLUB_PRO, SubscriptionPlan.CLUB_ULTRA];

function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.ACTIVE ||
    status === SubscriptionStatus.TRIALING
  );
}

export function SubscriptionSettingsPage() {
  const { data: subscription } = useCurrentSubscription();
  if (!subscription || subscription.selfHosted) return null;
  return <BillingSettingsPage />;
}

function BillingSettingsPage() {
  const { data: subscription, isLoading } = useCurrentSubscription();
  const { data: invoices } = useInvoices();
  const cancelMutation = useCancelSubscription();
  const resumeMutation = useResumeSubscription();
  const portalMutation = useCustomerPortal();
  const createCheckout = useCreateCheckout();
  const posthog = usePostHog();

  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<'athlete' | 'coach' | 'club'>(
    'athlete',
  );
  const [showIOSPaymentBlock, setShowIOSPaymentBlock] = useState(false);

  const handleManageBilling = async () => {
    // Check if payments are disabled (iOS)
    if (isPaymentDisabled()) {
      setShowIOSPaymentBlock(true);
      return;
    }

    setIsLoadingPortal(true);
    try {
      posthog?.capture(AnalyticsEvent.subscription_manage_billing_opened);
      const returnUrl = `${window.location.origin}/dashboard/settings?tab=subscription`;
      const { url } = await portalMutation.mutateAsync(returnUrl);
      window.location.href = url;
    } catch {
      toast.error(m.subscription_portal_error());
      setIsLoadingPortal(false);
    }
  };

  const handleCancel = async () => {
    if (confirm(m.subscription_cancel_confirm())) {
      try {
        await cancelMutation.mutateAsync();
        posthog?.capture('subscription_cancelled');
        toast.success(m.subscription_cancel_success());
      } catch {
        toast.error(m.subscription_cancel_error());
      }
    }
  };

  const handleResume = async () => {
    try {
      await resumeMutation.mutateAsync();
      posthog?.capture('subscription_resumed');
      toast.success(m.subscription_resume_success());
    } catch {
      toast.error(m.subscription_resume_error());
    }
  };

  // If payments are disabled (iOS), show unavailable message
  if (isPaymentDisabled()) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.feature_unavailable_ios()}</CardTitle>
            <CardDescription>
              {m.feature_unavailable_ios_description()}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return <div>{m.loading()}</div>;
  }

  if (!subscription) {
    return <div>{m.subscription_not_found()}</div>;
  }

  const plan = subscription.plan as SubscriptionPlan;
  const planConfig = PLAN_CONFIGS[plan];
  const status = subscription.status as SubscriptionStatus;

  // UX rule: if subscription is "active" but user is on FREE, treat as no subscription
  const shouldShowPurchaseOnly =
    plan === SubscriptionPlan.FREE && isSubscriptionActive(status);

  const handleUpgrade = async (nextPlan: SubscriptionPlan) => {
    // Check if payments are disabled (iOS)
    if (isPaymentDisabled()) {
      setShowIOSPaymentBlock(true);
      return;
    }

    setSelectedPlan(nextPlan);
    try {
      const successUrl = `${window.location.origin}/dashboard/settings?tab=subscription&success=true`;
      const cancelUrl = `${window.location.origin}/dashboard/settings?tab=subscription&canceled=true`;

      const { url } = await createCheckout.mutateAsync({
        plan: nextPlan,
        successUrl,
        cancelUrl,
      });

      posthog?.capture('subscription_upgrade_initiated', { plan: nextPlan });
      window.location.href = url;
    } catch (error) {
      posthog?.capture(AnalyticsEvent.subscription_checkout_failed, {
        plan: nextPlan,
        source: 'subscription_settings',
        error_code: analyticsErrorCodeFromUnknown(error),
      });
      toast.error(m.subscription_checkout_error());
    }
  };

  if (shouldShowPurchaseOnly) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{m.subscription_purchase_title()}</CardTitle>
            <CardDescription>
              {m.subscription_purchase_description()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="athlete">
                  {m.paywall_tab_athlete()}
                </TabsTrigger>
                <TabsTrigger value="coach">{m.paywall_tab_coach()}</TabsTrigger>
                <TabsTrigger value="club">{m.paywall_tab_club()}</TabsTrigger>
              </TabsList>

              <TabsContent value="athlete" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ATHLETE_PLANS.map((p) => {
                    const config = PLAN_CONFIGS[p];
                    return (
                      <PlanCard
                        key={config.plan}
                        plan={config}
                        onSelect={() => handleUpgrade(config.plan)}
                        isLoading={
                          createCheckout.isPending &&
                          selectedPlan === config.plan
                        }
                        isCurrentPlan={false}
                      />
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="coach" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {COACH_PLANS.map((p) => {
                    const config = PLAN_CONFIGS[p];
                    return (
                      <PlanCard
                        key={config.plan}
                        plan={config}
                        onSelect={() => handleUpgrade(config.plan)}
                        isLoading={
                          createCheckout.isPending &&
                          selectedPlan === config.plan
                        }
                        isCurrentPlan={false}
                      />
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="club" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {CLUB_PLANS.map((p) => {
                    const config = PLAN_CONFIGS[p];
                    return (
                      <PlanCard
                        key={config.plan}
                        plan={config}
                        onSelect={() => handleUpgrade(config.plan)}
                        isLoading={
                          createCheckout.isPending &&
                          selectedPlan === config.plan
                        }
                        isCurrentPlan={false}
                      />
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{m.subscription_current()}</CardTitle>
          <CardDescription>{m.subscription_current()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">
                {m.subscription_plan()}
              </div>
              <div className="text-lg font-semibold">
                {planNameMap[plan]} - €
                {planConfig.price.toFixed(2).replace('.', ',')}
                {m.plan_price_per_month()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                {m.subscription_status()}
              </div>
              <div className="text-lg font-semibold">
                {subscriptionStatusMap[
                  subscription.status as SubscriptionStatus
                ] || subscription.status}
              </div>
            </div>
            {subscription.currentPeriodStart &&
              subscription.currentPeriodEnd && (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {m.subscription_period()}
                    </div>
                    <div className="text-sm">
                      {format(new Date(subscription.currentPeriodStart), 'PP')}{' '}
                      - {format(new Date(subscription.currentPeriodEnd), 'PP')}
                    </div>
                  </div>
                  <div>
                    {subscription.cancelAtPeriodEnd && (
                      <div className="text-sm text-orange-600">
                        {m.subscription_cancel_at_period_end()}
                      </div>
                    )}
                  </div>
                </>
              )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            {subscription.cancelAtPeriodEnd ? (
              <Button
                onClick={handleResume}
                disabled={resumeMutation.isPending}
                className="w-full sm:w-auto"
              >
                {m.subscription_resume()}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="w-full sm:w-auto"
              >
                {m.subscription_cancel()}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={isLoadingPortal}
              className="w-full sm:w-auto"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {m.subscription_manage_billing()}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{m.subscription_invoices()}</CardTitle>
        </CardHeader>
        <CardContent>
          {!invoices || invoices.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {m.subscription_no_invoices()}
            </div>
          ) : (
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="font-medium">
                        €{invoice.amount.toFixed(2)}{' '}
                        {invoice.currency.toUpperCase()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(invoice.createdAt), 'PP')} -{' '}
                        {invoiceStatusMap[invoice.status.toLowerCase()] ||
                          invoice.status}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {invoice.invoiceUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(invoice.invoiceUrl!, '_blank')
                        }
                        className="w-full sm:w-auto"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {m.subscription_view_invoice()}
                      </Button>
                    )}
                    {invoice.invoicePdf && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(invoice.invoicePdf!, '_blank')
                        }
                        className="w-full sm:w-auto"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {m.subscription_download_invoice()}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <IOSPaymentBlockDialog
        open={showIOSPaymentBlock}
        onOpenChange={setShowIOSPaymentBlock}
      />
    </div>
  );
}
