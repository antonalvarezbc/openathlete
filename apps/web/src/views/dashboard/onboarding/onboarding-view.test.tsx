// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingView } from './onboarding-view';

const features = vi.hoisted(() => ({ manualGarminSync: false }));
const idle = vi.hoisted(() => () => ({
  mutate: () => undefined,
  isPending: false,
  isSuccess: false,
}));

vi.mock('@/api/installation/installation.hooks', () => ({
  useInstallationFeatures: () => features,
}));
vi.mock('@/api/athlete', () => ({
  useGetMyCoachesQuery: () => ({ data: [] }),
}));
vi.mock('@/api/user', () => ({
  useCompleteOnboardingMutation: idle,
  useGetMeQuery: () => ({
    data: { onboardingCompleted: false },
    isLoading: false,
  }),
}));
vi.mock('@/api/provider', () => ({
  useGetConnectedProvidersQuery: () => ({ data: [], isLoading: false }),
  useGetOAuthUriMutation: idle,
  useDisconnectProviderMutation: idle,
}));
vi.mock('@/contexts/auth', () => ({
  useAuthContext: () => ({ initialize: () => undefined, authenticated: true }),
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => undefined }));
vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => null,
}));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
// The card has its own tests; here only where and how it is mounted matters.
vi.mock('@/views/dashboard/settings-view/manual-garmin-card', () => ({
  ManualGarminCard: (props: { configure?: boolean; onboarding?: boolean }) => (
    <div
      data-manual-garmin
      data-configure={String(props.configure)}
      data-onboarding={String(props.onboarding)}
    />
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('onboarding connectors step', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // An athlete-only account without a coach, standing on the connectors
    // step: welcome, role, coach invitation, athlete info, connectors.
    localStorage.setItem(
      'openathlete_onboarding_data',
      JSON.stringify({ roles: ['ATHLETE'], athleteEmails: [] }),
    );
    localStorage.setItem('openathlete_onboarding_step', '4');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  const mount = () => act(async () => root.render(<OnboardingView />));
  const manualGarmin = () =>
    container.querySelector<HTMLElement>('[data-manual-garmin]');
  const skipButton = () =>
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'onboarding_connectors_skip',
    )!;

  it('lists unofficial Garmin sync last, where the installation enables it', async () => {
    features.manualGarminSync = true;
    await mount();
    expect(container.textContent).toContain('onboarding_connectors_title');

    const card = manualGarmin()!;
    expect(card).not.toBeNull();
    expect(card.dataset.configure).toBe('true');
    expect(card.dataset.onboarding).toBe('true');

    // After the four official providers, in the same list...
    const list = card.parentElement!;
    expect(list.children).toHaveLength(5);
    expect(list.lastElementChild).toBe(card);
    // ...and before the skip button.
    expect(
      card.compareDocumentPosition(skipButton()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows only the official providers on other installations', async () => {
    features.manualGarminSync = false;
    await mount();
    expect(container.textContent).toContain('onboarding_connectors_title');
    expect(manualGarmin()).toBeNull();
    expect(skipButton()).toBeDefined();
  });
});
