// @vitest-environment jsdom
import { SpaceContext } from '@/contexts/space/context/space-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ComponentProps, act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManualGarminCard } from './manual-garmin-card';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/utils/axios', () => ({ default: api }));
// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'en' }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const notConnected = {
  enabled: true,
  connected: false,
  canConfigure: true,
  athleteId: 7,
};

describe('ManualGarminCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  const mount = async (
    space: 'ATHLETE' | 'COACH',
    status: object,
    props: Partial<ComponentProps<typeof ManualGarminCard>> = {},
  ) => {
    api.get.mockResolvedValue({ data: status });
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queries}>
          <SpaceContext.Provider value={{ space, setSpace: () => undefined }}>
            <ManualGarminCard configure {...props} />
          </SpaceContext.Provider>
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    await settle();
  };

  const summaryButton = () => container.querySelector('button')!;
  const dialog = () => document.body.querySelector('[role="dialog"]');
  const click = (element: Element) =>
    act(async () => (element as HTMLElement).click());
  const buttonNamed = (name: string) =>
    [...dialog()!.querySelectorAll('button')].find(
      (button) => button.textContent === name,
    );

  it('offers the sign-in form during onboarding, whatever the stored space', async () => {
    await mount('COACH', notConnected, { onboarding: true });
    expect(api.get).toHaveBeenCalledWith('/provider/garmin-manual/status', {
      params: { athleteId: undefined },
    });
    expect(container.textContent).toContain('garmin_manual_onboarding_help');
    expect(summaryButton().textContent).toBe('connect');

    await click(summaryButton());
    expect(dialog()).not.toBeNull();
    expect(dialog()!.querySelector('input[type="email"]')).not.toBeNull();
    expect(dialog()!.querySelector('input[type="password"]')).not.toBeNull();
    // Opening the dialog never talks to Garmin.
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps credentials out of the coach space outside onboarding', async () => {
    await mount('COACH', notConnected);
    expect(container.textContent).not.toContain(
      'garmin_manual_onboarding_help',
    );
    expect(summaryButton().textContent).toBe('garmin_manual_open');

    await click(summaryButton());
    expect(dialog()!.textContent).toContain('garmin_login_needed');
    expect(dialog()!.querySelector('input[type="password"]')).toBeNull();
    expect(buttonNamed('garmin_login_setup')).toBeUndefined();
  });

  it('opens the sign-in form directly in the athlete space when not connected', async () => {
    await mount('ATHLETE', notConnected);
    expect(summaryButton().textContent).toBe('connect');
    await click(summaryButton());
    expect(dialog()!.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('asks before showing the form again once connected', async () => {
    await mount('ATHLETE', { ...notConnected, connected: true });
    expect(summaryButton().textContent).toBe('garmin_manual_open');

    await click(summaryButton());
    expect(dialog()!.querySelector('input[type="password"]')).toBeNull();
    await click(buttonNamed('garmin_login_reconnect')!);
    expect(dialog()!.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('renders nothing when the installation disables manual Garmin', async () => {
    await mount('ATHLETE', { enabled: false }, { onboarding: true });
    expect(container.innerHTML).toBe('');
  });
});
