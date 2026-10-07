// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingView } from './onboarding-view';

const features = vi.hoisted(() => ({ manualGarminSync: false }));
const completeOnboarding = vi.hoisted(() => vi.fn());
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
// The official connectors this instance has set up
const instance = vi.hoisted(() => ({
  providers: ['STRAVA', 'GARMIN', 'POLAR', 'SUUNTO'],
}));
vi.mock('@/api/instance', () => ({
  useInstanceInfoQuery: () => ({ data: instance, isPending: false }),
}));
vi.mock('@/api/user', () => ({
  useCompleteOnboardingMutation: () => ({
    mutate: completeOnboarding,
    isPending: false,
    isSuccess: false,
  }),
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

  it('keeps unofficial Garmin sync on an instance without official connectors', async () => {
    features.manualGarminSync = true;
    instance.providers = [];
    await mount();
    expect(container.textContent).toContain('connectors_unavailable_title');
    expect(manualGarmin()).not.toBeNull();
    instance.providers = ['STRAVA', 'GARMIN', 'POLAR', 'SUUNTO'];
  });

  it('shows only the official providers on other installations', async () => {
    features.manualGarminSync = false;
    await mount();
    expect(container.textContent).toContain('onboarding_connectors_title');
    expect(manualGarmin()).toBeNull();
    expect(skipButton()).toBeDefined();
  });
});

describe('onboarding coach step: coaching yourself', () => {
  let container: HTMLDivElement;
  let root: Root;

  const start = (roles: string[], step: number) => {
    localStorage.setItem(
      'openathlete_onboarding_data',
      JSON.stringify({ roles, athleteEmails: [] }),
    );
    localStorage.setItem('openathlete_onboarding_step', String(step));
  };

  beforeEach(() => {
    completeOnboarding.mockReset();
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
  const checkbox = () =>
    container.querySelector<HTMLButtonElement>('button[role="checkbox"]');
  const find = (name: string) =>
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === name,
    );
  // Steps animate in and out: wait for the button of the next step.
  const press = async (name: string) => {
    await vi.waitFor(() => expect(find(name)).toBeDefined());
    await act(async () => find(name)!.click());
  };

  it('offers it to athletes who are also coaches, unchecked by default', async () => {
    // welcome, role, athlete info, connectors, athlete invitations
    start(['ATHLETE', 'COACH'], 4);
    await mount();
    expect(container.textContent).toContain('onboarding_coach_self');
    expect(checkbox()!.getAttribute('aria-checked')).toBe('false');

    await act(async () => checkbox()!.click());
    expect(checkbox()!.getAttribute('aria-checked')).toBe('true');
    await press('onboarding_next');
    await press('onboarding_complete_continue');
    expect(completeOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: ['ATHLETE', 'COACH'],
        coachSelf: true,
      }),
    );
  });

  it('is not sent unless checked', async () => {
    start(['ATHLETE', 'COACH'], 5);
    await mount();
    await press('onboarding_complete_continue');
    expect(completeOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ coachSelf: false }),
    );
  });

  it('is not offered to coach-only accounts', async () => {
    // welcome, role, athlete invitations
    start(['COACH'], 2);
    await mount();
    expect(container.textContent).toContain(
      'onboarding_athlete_invitations_title',
    );
    expect(container.textContent).not.toContain('onboarding_coach_self');
    expect(checkbox()).toBeNull();
  });
});
