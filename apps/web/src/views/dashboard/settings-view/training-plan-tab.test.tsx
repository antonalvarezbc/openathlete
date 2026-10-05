// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrainingPlanTab } from './training-plan-tab';

const api = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@/api/plan-workspace/plan-workspace.api', () => ({
  PlanWorkspaceAPI: { list: api.list },
}));
vi.mock('@/api/athlete', () => ({
  useGetMyAthleteQuery: () => ({ data: { athleteId: 1 } }),
  useGetMyCoachedAthletesQuery: () => ({
    data: [{ athleteId: 4, user: { firstName: 'Ana', lastName: 'Runner' } }],
    isError: false,
  }),
}));
vi.mock('@/contexts/auth', () => ({ useUserRoles: () => ['COACH'] }));
// Heavy children render as markers: this test is about the selection.
vi.mock('@/components/plan-workspace/calendar-weeks', () => ({
  CalendarWeeks: () => <div data-calendar-weeks />,
}));
vi.mock('@/components/plan-workspace/plan-weeks', () => ({
  PlanWeeks: () => <div data-plan-weeks />,
}));
vi.mock('@/components/plan-workspace/plan-races', () => ({
  PlanRaces: () => null,
}));
vi.mock('@/components/plan-workspace/plan-editor', () => ({
  PlanEditor: () => null,
}));
vi.mock('@/components/plan-workspace/athlete-injuries', () => ({
  AthleteInjuries: () => null,
}));
vi.mock('@/components/coach-assistant/coach-assistant', () => ({
  CoachAssistant: () => null,
}));
const aiPlans = vi.hoisted(() => ({ available: true, isLoading: false }));
vi.mock('@/api/ai-settings', () => ({ useAiTaskAvailable: () => aiPlans }));
vi.mock('@/components/ai-settings', () => ({
  AiSetupDialog: ({ open }: { open: boolean }) =>
    open ? <div data-ai-setup /> : null,
}));
vi.mock('@/components/ai-plan/ai-plan-dialog', () => ({
  AiPlanDialog: () => <div data-ai-plan />,
}));
vi.mock('./plan-adaptation-section', () => ({
  PlanAdaptationSection: ({
    selection,
  }: {
    selection: { planId?: number };
  }) => <div data-adaptation={selection.planId ?? 'calendar'} />,
}));
// Every message renders as its key.
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'en' }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString();
const plan = (trainingPlanId: number, status: string, from = -10, to = 30) => ({
  trainingPlanId,
  athleteId: 4,
  name: `Plan ${trainingPlanId}`,
  goal: 'Goal',
  description: null,
  status,
  startDate: iso(from),
  endDate: iso(to),
  races: [],
  cycles: [],
});

let search = '';
function Location() {
  search = useLocation().search;
  return null;
}

describe('TrainingPlanTab', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    api.list.mockReset();
  });

  const open = async (query: string) => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={[`/dashboard/planning?${query}`]}>
            <TrainingPlanTab />
            <Location />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
    // The plans load, then the default choice is applied.
    for (let tries = 0; tries < 50 && !api.list.mock.calls.length; tries++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  };
  const planSelect = () =>
    container.querySelector<HTMLSelectElement>('select[name="plan"]')!;

  it('opens the active plan covering today', async () => {
    api.list.mockResolvedValue([plan(7, 'DRAFT'), plan(8, 'ACTIVE')]);
    await open('athleteId=4');
    expect(new URLSearchParams(search).get('planId')).toBe('8');
    expect(planSelect().value).toBe('8');
    expect(container.querySelector('[data-plan-weeks]')).not.toBeNull();
    expect(container.querySelector('[data-planning-calendar]')).toBeNull();
  });

  it('opens the calendar when there is no plan', async () => {
    api.list.mockResolvedValue([]);
    await open('athleteId=4');
    expect(new URLSearchParams(search).get('planId')).toBe('calendar');
    expect(planSelect().value).toBe('calendar');
    expect(container.querySelector('[data-calendar-weeks]')).not.toBeNull();
    // Adaptation works without a plan.
    expect(
      container
        .querySelector('[data-adaptation]')!
        .getAttribute('data-adaptation'),
    ).toBe('calendar');
  });

  it('keeps the calendar when the coach chose it over an active plan', async () => {
    api.list.mockResolvedValue([plan(8, 'ACTIVE')]);
    await open('athleteId=4&planId=calendar');
    expect(new URLSearchParams(search).get('planId')).toBe('calendar');
    expect(container.querySelector('[data-planning-calendar]')).not.toBeNull();
    expect(container.querySelector('[data-plan-weeks]')).toBeNull();
  });

  it('switches between the calendar and a plan from the selector', async () => {
    api.list.mockResolvedValue([plan(8, 'ACTIVE')]);
    await open('athleteId=4');
    await act(async () => {
      const select = planSelect();
      select.value = 'calendar';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(new URLSearchParams(search).get('planId')).toBe('calendar');
    expect(container.querySelector('[data-planning-calendar]')).not.toBeNull();
  });
  it('points to Settings > AI instead of the AI plan dialog when there is no AI for plans', async () => {
    api.list.mockResolvedValue([]);
    aiPlans.available = false;
    await open('athleteId=4');
    const create = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'ai_plan_create',
    )!;
    await act(async () => create.click());
    expect(container.querySelector('[data-ai-setup]')).not.toBeNull();
    expect(container.querySelector('[data-ai-plan]')).toBeNull();

    aiPlans.available = true;
    await act(async () => create.click());
    expect(container.querySelector('[data-ai-plan]')).not.toBeNull();
  });
});
