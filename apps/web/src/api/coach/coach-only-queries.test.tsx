// @vitest-environment jsdom
import { AuthContext, AuthContextType } from '@/contexts/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGetMyCoachedAthletesQuery } from '../athlete/athlete.hooks';
import { useCoachDashboardQuery } from './coach.hooks';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/utils/axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/axios')>()),
  default: api,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Seen = { data?: unknown; isLoading: boolean };

function Probe({
  enabled,
  seen,
}: {
  enabled?: boolean;
  seen: { athletes?: Seen; dashboard?: Seen };
}) {
  const athletes = useGetMyCoachedAthletesQuery(
    enabled === undefined ? undefined : { enabled },
  );
  const dashboard = useCoachDashboardQuery(undefined, undefined, { enabled });
  seen.athletes = { data: athletes.data, isLoading: athletes.isLoading };
  seen.dashboard = { data: dashboard.data, isLoading: dashboard.isLoading };
  return null;
}

describe('queries that need the coach role', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    api.get.mockReset().mockImplementation(async (url: string) => ({
      data: url === '/athlete/coached' ? [] : { athletes: [] },
    }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (roles: string[] | null, enabled?: boolean) => {
    const seen: { athletes?: Seen; dashboard?: Seen } = {};
    const auth = {
      user: roles && { userId: 1, roles },
    } as unknown as AuthContextType;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () =>
      root.render(
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <Probe enabled={enabled} seen={seen} />
          </QueryClientProvider>
        </AuthContext.Provider>,
      ),
    );
    return seen;
  };
  const requested = () => api.get.mock.calls.map(([url]) => url as string);

  it('asks nothing for an athlete-only account, and is not left loading', async () => {
    const seen = await render(['ATHLETE']);
    expect(requested()).toEqual([]);
    expect(seen.athletes).toEqual({ data: undefined, isLoading: false });
    expect(seen.dashboard).toEqual({ data: undefined, isLoading: false });
  });

  it('asks nothing before the user is known', async () => {
    await render(null);
    expect(requested()).toEqual([]);
  });

  it.each([[['COACH']], [['ATHLETE', 'COACH']]])(
    'asks for a coach (%j)',
    async (roles) => {
      await render(roles);
      expect(requested()).toContain('/athlete/coached');
      expect(requested()).toContain('/coach/dashboard');
    },
  );

  it("keeps the caller's own enabled option", async () => {
    await render(['COACH'], false);
    expect(requested()).toEqual([]);
  });
});
