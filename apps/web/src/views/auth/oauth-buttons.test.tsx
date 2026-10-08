// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { OAuthButtons } from './oauth-buttons';

const api = vi.hoisted(() => ({ loginWithFirebase: vi.fn() }));

vi.mock('@/api/auth/auth.api', () => ({
  AuthAPI: { loginWithFirebase: api.loginWithFirebase },
}));
vi.mock('@/api/instance', () => ({
  useInstanceInfoQuery: () => ({ data: { googleSignIn: true } }),
}));
vi.mock('@/utils/firebase-auth', () => ({
  isFirebaseWebConfigured: () => true,
  getFirebaseIdTokenForProvider: async () => 'firebase-id-token',
}));
vi.mock('@/contexts/auth', () => ({
  useAuthContext: () => ({ initialize: vi.fn() }),
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
// The app is shown in Italian.
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'it' }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('OAuthButtons', () => {
  it('sends the language of the app, for an account it creates', async () => {
    api.loginWithFirebase.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
    });
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <OAuthButtons />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );

    const google = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('continue_with_google'),
    )!;
    await act(async () => google.click());

    expect(api.loginWithFirebase.mock.calls[0][0]).toMatchObject({
      idToken: 'firebase-id-token',
      language: 'IT',
    });
    act(() => root.unmount());
  });
});
