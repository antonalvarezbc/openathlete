// @vitest-environment jsdom
import { SidebarProvider } from '@/components/ui/sidebar';
import { AuthContext, AuthContextType } from '@/contexts/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from './app-sidebar';

// The API refuses the coached athletes to an account without the coach role.
const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/axios')>()),
  default: api,
}));
vi.mock('@/contexts/space', () => ({
  useSpaceContext: () => ({ space: 'ATHLETE' }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));
vi.mock('@/components/sidebar/nav-user', () => ({ NavUser: () => null }));
vi.mock('@/components/sidebar/space-switcher', () => ({
  SpaceSwitcher: () => null,
}));
vi.mock('@/components/mobile/mobile-account-controls', () => ({
  MobileAccountControls: () => null,
}));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

let root: Root | undefined;
let container: HTMLDivElement;

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('AppSidebar for an athlete-only account', () => {
  it('shows the athlete pages without asking for coached athletes', async () => {
    api.get.mockReset().mockRejectedValue(
      new AxiosError('Forbidden', AxiosError.ERR_BAD_REQUEST, undefined, null, {
        status: 403,
        statusText: 'Forbidden',
        data: {},
        headers: {},
        config: {} as never,
      }),
    );
    const errors = vi.spyOn(console, 'error');
    const auth = {
      user: { userId: 5, roles: ['ATHLETE'] },
    } as unknown as AuthContextType;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter initialEntries={['/dashboard/calendar']}>
              <SidebarProvider defaultOpen>
                <AppSidebar />
              </SidebarProvider>
            </MemoryRouter>
          </QueryClientProvider>
        </AuthContext.Provider>,
      ),
    );

    expect(api.get).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(
      document.querySelector('a[href="/dashboard/calendar"]'),
    ).not.toBeNull();
    expect(document.querySelector('a[href="/dashboard/coach"]')).toBeNull();
  });
});
