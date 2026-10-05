// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupporterOffer } from './supporter-offer';

const mutateAsync = vi.fn();
vi.mock('@/api/subscription', () => ({
  useCreateCheckout: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/utils/capacitor', () => ({ isPaymentDisabled: () => false }));
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/components/payment/ios-payment-block-dialog', () => ({
  IOSPaymentBlockDialog: () => null,
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'en' }));
vi.mock('@/paraglide/messages', () => ({
  m: {
    plan_supporter_name: () => 'Supporter',
    supporter_interval_label: () => 'Billing',
    supporter_interval_monthly: () => 'Monthly',
    supporter_interval_yearly: () => 'Yearly',
    supporter_yearly_saving: () => '2 months free',
    supporter_price_month: ({ price }: { price: number }) => `€${price}/month`,
    supporter_price_year: ({ price }: { price: number }) => `€${price}/year`,
    supporter_perk_athletes: ({ count }: { count: number }) =>
      `Unlimited athletes (free: ${count})`,
    supporter_perk_ai: () => 'AI included',
    supporter_perk_project: () => 'Fund the project',
    supporter_cta: () => 'Become a Supporter',
    supporter_terms_consent: () => 'I accept the terms of sale',
    supporter_terms_link: () => 'Read the terms of sale',
    supporter_no_commitment: () => 'Cancel anytime',
    loading: () => 'Loading',
    subscription_checkout_error: () => 'Checkout failed',
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('SupporterOffer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ url: '#checkout' });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<SupporterOffer analyticsSource="test" />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const button = (name: string) =>
    [...container.querySelectorAll('button')].find((item) =>
      item.textContent?.includes(name),
    )!;

  it('shows both prices and the free-plan limit', () => {
    expect(container.textContent).toContain('€5/month');
    expect(container.textContent).toContain('€50/year');
    expect(container.textContent).toContain('Unlimited athletes (free: 5)');
  });

  const acceptTerms = () =>
    act(() =>
      container.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click(),
    );

  it('waits for the terms of sale to be accepted', () => {
    expect(button('Become a Supporter').disabled).toBe(true);
    expect(container.querySelector('a[href$="/terms-of-sale"]')).not.toBeNull();

    acceptTerms();

    expect(button('Become a Supporter').disabled).toBe(false);
  });

  it('defaults to yearly billing', async () => {
    expect(button('Yearly').getAttribute('aria-checked')).toBe('true');

    acceptTerms();
    await act(async () => button('Become a Supporter').click());

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ interval: 'year', acceptTerms: true }),
    );
  });

  it('checks out the interval the user picks', async () => {
    act(() => button('Monthly').click());
    acceptTerms();
    await act(async () => button('Become a Supporter').click());

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ interval: 'month' }),
    );
  });
});
