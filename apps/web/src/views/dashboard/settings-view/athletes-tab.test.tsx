// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AthletesTab } from './athletes-tab';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));
const session = vi.hoisted(() => ({
  user: { userId: 8, roles: ['ATHLETE', 'COACH'] as string[] },
}));

vi.mock('@/utils/axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/axios')>()),
  default: api,
}));
vi.mock('@/contexts/auth', () => ({
  useAuthContext: () => ({ user: session.user }),
  useUserRoles: () => session.user.roles,
}));
vi.mock('@/api/installation/installation.hooks', () => ({
  useInstallationFeatures: () => ({ manualGarminSync: false }),
}));
vi.mock('@/hooks/use-feature-access', () => ({
  useAthleteLimit: () => ({ maxAthletes: null }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => undefined }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const athlete = (athleteId: number, userId: number, firstName: string) => ({
  athleteId,
  trainingZones: [],
  user: { userId, firstName, lastName: 'Test', email: `${firstName}@x.test` },
});
const other = athlete(40, 20, 'Ana');
const me = athlete(31, 8, 'Me');

describe('AthletesTab: coaching yourself', () => {
  let container: HTMLDivElement;
  let root: Root;
  let coached: object[];

  beforeEach(() => {
    session.user = { userId: 8, roles: ['ATHLETE', 'COACH'] };
    coached = [other];
    api.get.mockReset().mockImplementation(async (url: string) => ({
      data: url === '/athlete/coached' ? coached : [],
    }));
    api.post.mockReset().mockImplementation(async () => {
      coached = [other, me];
      return { data: { created: true } };
    });
    api.delete.mockReset().mockResolvedValue({ data: undefined });
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
  const mount = async () => {
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queries}>
          <AthletesTab />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/athlete/coached'),
    );
    await settle();
  };
  const offer = () => container.querySelector('[data-coach-self]');
  const button = (name: string) =>
    [...document.body.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === name,
    );

  it('offers coaching yourself to a coach who is also an athlete', async () => {
    await mount();
    expect(offer()?.textContent).toContain('coach_self_help');

    await act(async () => button('coach_self_button')!.click());
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/athlete/coach-self'),
    );
    await settle();
    // The list reloads with the coach in it, and the offer goes away.
    await vi.waitFor(() => expect(offer()).toBeNull());
    expect(container.textContent).toContain('coach_self_you');
  });

  it('marks your own row and lets you stop coaching yourself', async () => {
    coached = [other, me];
    await mount();
    expect(offer()).toBeNull();
    const rows = [...container.querySelectorAll('li')];
    const mine = rows.find((row) => row.textContent?.includes('Me Test'))!;
    const theirs = rows.find((row) => row.textContent?.includes('Ana Test'))!;
    expect(mine.textContent).toContain('coach_self_you');
    expect(mine.textContent).toContain('coach_self_stop');
    expect(theirs.textContent).not.toContain('coach_self_you');
    expect(theirs.textContent).toContain('delete_');

    await act(async () =>
      [...mine.querySelectorAll('button')]
        .find((element) => element.textContent === 'coach_self_stop')!
        .click(),
    );
    expect(document.body.textContent).toContain('coach_self_stop_confirm');
  });

  it('does not offer it to coach-only accounts', async () => {
    session.user = { userId: 8, roles: ['COACH'] };
    await mount();
    expect(offer()).toBeNull();
  });
});
