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
    expect(buttonNamed('garmin_login_change')).toBeUndefined();
  });

  it('opens the sign-in form directly in the athlete space when not connected', async () => {
    await mount('ATHLETE', notConnected);
    expect(summaryButton().textContent).toBe('connect');
    await click(summaryButton());
    expect(dialog()!.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('tucks the account away at the end once connected', async () => {
    await mount('ATHLETE', { ...notConnected, connected: true });
    expect(summaryButton().textContent).toBe('garmin_manual_open');

    await click(summaryButton());
    expect(dialog()!.querySelector('input[type="password"]')).toBeNull();
    const update = buttonNamed('garmin_manual_button')!;
    const change = buttonNamed('garmin_login_change')!;
    // Updating comes first; changing the account is a quiet link at the end.
    expect(
      update.compareDocumentPosition(change) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(change.className).toContain('underline-offset-4');
    expect(change.getAttribute('aria-expanded')).toBe('false');

    await click(change);
    expect(dialog()!.querySelector('input[type="password"]')).not.toBeNull();
    expect(dialog()!.textContent).toContain('garmin_login_reconnect_help');

    // Closed and opened again, the form is tucked away again.
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    await vi.waitFor(() => expect(dialog()).toBeNull());
    await click(summaryButton());
    expect(dialog()!.querySelector('input[type="password"]')).toBeNull();
  });

  it('makes signing in again stand out when Garmin rejects the session', async () => {
    await mount('ATHLETE', {
      ...notConnected,
      connected: true,
      error: 'GARMIN_LOGIN_REQUIRED',
    });
    await click(summaryButton());
    expect(dialog()!.textContent).toContain('garmin_backfill_auth');
    expect(buttonNamed('garmin_login_change')!.className).not.toContain(
      'underline-offset-4',
    );
  });

  it('disconnects only after a second click, then offers to sign in again', async () => {
    await mount('ATHLETE', { ...notConnected, connected: true });
    await click(summaryButton());
    const disconnect = buttonNamed('disconnect')!;
    expect(disconnect.getAttribute('aria-expanded')).toBe('false');

    await click(disconnect);
    expect(dialog()!.textContent).toContain('garmin_manual_disconnect_help');
    expect(api.post).not.toHaveBeenCalled();
    // Cancelling keeps the connection
    await click(buttonNamed('cancel')!);
    expect(dialog()!.textContent).not.toContain(
      'garmin_manual_disconnect_help',
    );

    await click(buttonNamed('disconnect')!);
    api.post.mockResolvedValue({ data: notConnected });
    api.get.mockResolvedValue({ data: notConnected });
    const confirm = [...dialog()!.querySelectorAll('button')].filter(
      (button) => button.textContent === 'disconnect',
    )[1];
    await click(confirm);
    expect(api.post).toHaveBeenCalledWith(
      '/provider/garmin-manual/disconnect',
      { athleteId: undefined },
    );
    await vi.waitFor(() =>
      expect(dialog()!.querySelector('input[type="password"]')).not.toBeNull(),
    );
  });

  it('never lets a coach disconnect an athlete', async () => {
    await mount(
      'COACH',
      { ...notConnected, connected: true, canConfigure: false, athleteId: 40 },
      { display: 'button', size: 'sm', athleteId: 40 },
    );
    await click(summaryButton());
    expect(buttonNamed('garmin_manual_button')).toBeDefined();
    expect(buttonNamed('disconnect')).toBeUndefined();
  });

  it('only shows how to connect while not connected', async () => {
    await mount('ATHLETE', notConnected);
    await click(summaryButton());
    expect(buttonNamed('garmin_manual_button')).toBeUndefined();
    expect(buttonNamed('garmin_backfill_button')).toBeUndefined();
  });

  describe('as a button in settings', () => {
    it('shows the name and the state, and opens the same dialog', async () => {
      await mount(
        'ATHLETE',
        { ...notConnected, connected: true, lastSuccess: undefined },
        { display: 'button' },
      );
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(summaryButton().textContent).toBe(
        'garmin_manual_titlegarmin_manual_connected',
      );
      await click(summaryButton());
      expect(buttonNamed('garmin_manual_button')).toBeDefined();
    });

    it('lets coaches who coach themselves connect from their own row', async () => {
      await mount(
        'COACH',
        { ...notConnected, athleteId: 31 },
        { display: 'button', size: 'sm', athleteId: 31 },
      );
      expect(api.get).toHaveBeenCalledWith('/provider/garmin-manual/status', {
        params: { athleteId: 31 },
      });
      expect(summaryButton().textContent).toContain(
        'garmin_manual_not_connected',
      );
      await click(summaryButton());
      expect(dialog()!.querySelector('input[type="password"]')).not.toBeNull();
    });

    it('never asks for credentials of another athlete', async () => {
      await mount(
        'COACH',
        { ...notConnected, canConfigure: false, athleteId: 40 },
        { display: 'button', size: 'sm', athleteId: 40 },
      );
      await click(summaryButton());
      expect(dialog()!.textContent).toContain('garmin_login_needed');
      expect(dialog()!.querySelector('input[type="password"]')).toBeNull();
    });
  });

  it('renders nothing when the installation disables manual Garmin', async () => {
    await mount('ATHLETE', { enabled: false }, { onboarding: true });
    expect(container.innerHTML).toBe('');
  });
});
