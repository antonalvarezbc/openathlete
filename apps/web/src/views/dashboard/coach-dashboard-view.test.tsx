// @vitest-environment jsdom
import { SpaceContext } from '@/contexts/space/context/space-context';
import { CoachDashboardPage } from '@/pages/dashboard/coach';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoachOverviewAthleteDto } from '@openathlete/shared';

import { DashboardView } from './dashboard-view';

const api = vi.hoisted(() => ({ get: vi.fn() }));
const session = vi.hoisted(() => ({ roles: ['COACH'] as string[] }));

vi.mock('@/utils/axios', () => ({
  default: api,
  routes: { coach: { overview: '/coach/overview' } },
}));
vi.mock('@/contexts/auth', () => ({ useUserRoles: () => session.roles }));
// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'es' }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const athlete = (
  overrides: Partial<CoachOverviewAthleteDto>,
): CoachOverviewAthleteDto => ({
  athleteId: 1,
  firstName: 'Ana',
  lastName: 'Ruiz',
  isSelf: false,
  due: 4,
  done: 4,
  compliancePercent: 100,
  plannedTime: 0,
  completedTime: 0,
  timePercent: null,
  missed: [],
  missedCount: 0,
  todayPlanned: 1,
  todayDone: 1,
  upcoming: 3,
  unlinkedActivities: 0,
  lastActivityAt: new Date().toISOString(),
  activeInjuries: 0,
  ...overrides,
});

function Location() {
  return (
    <output id="path">{useLocation().pathname + useLocation().search}</output>
  );
}

describe('coach dashboard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    session.roles = ['COACH'];
    api.get.mockReset();
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
  const render = async (path: string, space: 'COACH' | 'ATHLETE' = 'COACH') => {
    await act(async () => {
      root.render(
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <SpaceContext.Provider value={{ space, setSpace: () => undefined }}>
            <MemoryRouter
              key={`${path}:${space}:${session.roles}`}
              initialEntries={[path]}
            >
              <Routes>
                <Route path="/dashboard" element={<DashboardView />} />
                <Route
                  path="/dashboard/coach"
                  element={<CoachDashboardPage />}
                />
                <Route path="*" element={null} />
              </Routes>
              <Location />
            </MemoryRouter>
          </SpaceContext.Provider>
        </QueryClientProvider>,
      );
    });
    await settle();
  };
  const path = () => container.querySelector('#path')!.textContent;
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find(
      (element) => element.textContent === name,
    )!;

  it('is where coaches land', async () => {
    api.get.mockResolvedValue({ data: { athletes: [] } });
    await render('/dashboard');
    expect(path()).toBe('/dashboard/coach');
    await render('/dashboard', 'ATHLETE');
    expect(path()).toBe('/dashboard/calendar');
  });

  it('keeps old planning links and sends athletes to their calendar', async () => {
    await render('/dashboard/coach?athleteId=7&planId=2');
    expect(path()).toBe('/dashboard/planning?athleteId=7&planId=2');
    session.roles = ['ATHLETE'];
    await render('/dashboard/coach');
    expect(path()).toBe('/dashboard/calendar');
  });

  it('shows team compliance, who needs attention and each athlete', async () => {
    api.get.mockResolvedValue({
      data: {
        athletes: [
          athlete({ athleteId: 1, firstName: 'Ana' }),
          athlete({
            athleteId: 2,
            firstName: 'Bea',
            due: 4,
            done: 1,
            compliancePercent: 25,
            todayPlanned: 1,
            todayDone: 0,
            activeInjuries: 1,
          }),
          athlete({
            athleteId: 3,
            firstName: 'Me',
            isSelf: true,
            due: 0,
            done: 0,
            compliancePercent: null,
            todayPlanned: 0,
            todayDone: 0,
            upcoming: 0,
            lastActivityAt: null,
          }),
        ],
      },
    });
    await render('/dashboard/coach');

    // Local day boundaries for the last 7 days and the next week.
    const { params } = api.get.mock.calls[0][1];
    const from = new Date(params.from);
    const today = new Date(params.today);
    expect(api.get.mock.calls[0][0]).toBe('/coach/overview');
    expect(today.getHours()).toBe(0);
    expect((+today - +from) / 86_400_000).toBeCloseTo(7, 0);

    // Spanish percentages use a no-break space before the sign.
    const stats = container
      .querySelector('section')!
      .textContent!.replace(/\u00a0/g, ' ');
    // 5 of 8 due sessions done; 1 of 2 sessions today; 2 of 3 need attention.
    expect(stats).toContain('63 %');
    expect(stats).toContain('1/2');
    expect(stats).toContain('2/3');

    const attention = container.querySelector('[data-attention]')!;
    expect(
      [...attention.querySelectorAll('[data-athlete]')].map(
        (item) => item.querySelector('span')!.textContent,
      ),
    ).toEqual(['Bea Ruiz', 'Me Ruizcoach_self_you']);
    expect(
      [...attention.querySelectorAll('[data-reason]')].map((item) =>
        item.getAttribute('data-reason'),
      ),
    ).toEqual(['injury', 'low_compliance', 'inactive', 'no_plan']);

    // Lowest compliance first, without due sessions last.
    const rows = [
      ...container.querySelectorAll('[data-compliance] [data-athlete]'),
    ].map((row) => row.getAttribute('data-athlete'));
    expect(rows).toEqual(['2', '1', '3']);
    expect(
      container
        .querySelector('[data-athlete="2"] [role="progressbar"]')!
        .getAttribute('aria-valuenow'),
    ).toBe('25');

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-athlete="2"] button')!
        .click(),
    );
    expect(path()).toBe('/dashboard/calendar/2');
  });

  it('reviews the last 28 days on request', async () => {
    api.get.mockResolvedValue({ data: { athletes: [athlete({})] } });
    await render('/dashboard/coach');
    const [, last28] = [
      ...container.querySelectorAll('[role="group"] button'),
    ] as HTMLButtonElement[];
    await act(async () => last28.click());
    await settle();
    expect(last28.getAttribute('aria-pressed')).toBe('true');
    const { params } = api.get.mock.calls.at(-1)![1];
    expect(
      Math.round(
        (+new Date(params.today) - +new Date(params.from)) / 86_400_000,
      ),
    ).toBe(28);
  });

  it('invites a first athlete when there are none', async () => {
    api.get.mockResolvedValue({ data: { athletes: [] } });
    await render('/dashboard/coach');
    expect(container.textContent).toContain('no_coached_athletes');
    await act(async () => button('invite_athlete').click());
    expect(path()).toBe('/dashboard/settings?tab=athletes');
  });

  it('says so when the dashboard cannot load', async () => {
    api.get.mockRejectedValue(new Error('down'));
    await render('/dashboard/coach');
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      'coach_home_failed',
    );
    expect(container.textContent).not.toContain('no_coached_athletes');
  });
});
