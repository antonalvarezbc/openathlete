// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CYCLE_PHASE, SEOPlanData, SPORT_TYPE } from '@openathlete/shared';

import { AiPlanSteps, issueText } from './ai-plan-review';

const api = vi.hoisted(() => ({ weekSteps: vi.fn() }));

vi.mock('@/api/ai-plan', () => ({ AiPlanAPI: { weekSteps: api.weekSteps } }));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy(
    {},
    {
      get: (_target, key) => (params?: Record<string, unknown>) =>
        params ? `${String(key)} ${JSON.stringify(params)}` : String(key),
    },
  ),
}));
vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'es' }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const steady = [
  { stepType: 'STEADY', durationType: 'TIME', durationValue: 1200 },
];
const plan = (weeks: number): SEOPlanData => ({
  plan: {
    name: 'Plan',
    description: '',
    goal: '10K',
    sportType: SPORT_TYPE.RUNNING,
    distance: 10000,
    duration: weeks,
  },
  cycles: [
    {
      name: 'Build',
      description: '',
      phase: CYCLE_PHASE.BASE,
      weeks: Array.from({ length: weeks }, (_, index) => ({
        weekNumber: index + 1,
        sessions: [
          {
            dayOfWeek: 2,
            name: `Easy ${index + 1}`,
            sport: SPORT_TYPE.RUNNING,
            description: "20' easy",
            goalDuration: 1200,
          },
          {
            dayOfWeek: 4,
            name: `Intervals ${index + 1}`,
            sport: SPORT_TYPE.RUNNING,
            description: "10' + 5x3' Z4 + 10'",
            goalDuration: 2400,
          },
        ],
      })),
    },
  ],
});

describe('AiPlanSteps', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onPlan = vi.fn();
  const onRunningChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (weeks: number) =>
    act(async () =>
      root.render(
        <AiPlanSteps
          plan={plan(weeks)}
          athleteId={4}
          onPlan={onPlan}
          onRunningChange={onRunningChange}
        />,
      ),
    );
  const button = (text: string) =>
    [...container.querySelectorAll('button')].find(
      (item) => item.textContent === text,
    )!;
  const waitFor = async (check: () => boolean) => {
    for (let tries = 0; tries < 200 && !check(); tries++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
  };

  it('structures week by week, two at a time, keeping failed sessions as text', async () => {
    let running = 0;
    let most = 0;
    api.weekSteps.mockImplementation(
      async ({ sessions }: { sessions: Array<{ text: string }> }) => {
        running++;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        // The intervals of week 2 cannot be structured.
        return {
          steps: sessions.map((session, index) =>
            api.weekSteps.mock.calls.length === 2 && index === 1
              ? null
              : session.text
                ? steady
                : null,
          ),
        };
      },
    );
    await render(3);
    await act(async () => button('ai_plan_steps_run').click());
    await waitFor(
      () => !!container.textContent?.includes('ai_plan_steps_done'),
    );

    expect(api.weekSteps).toHaveBeenCalledTimes(3);
    expect(most).toBe(2);
    expect(api.weekSteps.mock.calls[0][0]).toEqual({
      athleteId: 4,
      sessions: [
        { sport: 'RUNNING', text: "20' easy" },
        { sport: 'RUNNING', text: "10' + 5x3' Z4 + 10'" },
      ],
    });
    const last = onPlan.mock.calls.at(-1)![0] as SEOPlanData;
    const sessions = last.cycles[0].weeks.flatMap((week) => week.sessions);
    expect(sessions.filter((session) => session.workout).length).toBe(5);
    expect(container.textContent).toContain(
      'ai_plan_steps_failed {"count":"1"}',
    );
    expect(onRunningChange.mock.calls).toEqual([[true], [false]]);
  });

  it('keeps what was done when a week fails or the coach stops', async () => {
    let calls = 0;
    api.weekSteps.mockImplementation(
      (_request: unknown, signal: AbortSignal) =>
        new Promise((resolve, reject) => {
          calls++;
          if (calls === 1) return resolve({ steps: [steady, steady] });
          if (calls === 2) return reject(new Error('provider'));
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await render(4);
    await act(async () => button('ai_plan_steps_run').click());
    await waitFor(() => calls >= 3);
    await act(async () => button('ai_plan_steps_stop').click());
    await waitFor(
      () => !!container.textContent?.includes('ai_plan_steps_stopped'),
    );

    // Week 3 was stopped and week 4 never requested.
    expect(api.weekSteps.mock.calls.length).toBeLessThanOrEqual(4);
    const last = onPlan.mock.calls.at(-1)![0] as SEOPlanData;
    expect(last.cycles[0].weeks[0].sessions[0].workout).toBeTruthy();
    expect(last.cycles[0].weeks[1].sessions[0].workout).toBeUndefined();
    expect(container.textContent).toContain(
      'ai_plan_steps_failed {"count":"2"}',
    );
  });

  it('requests no more weeks after stop, even if a week still answers', async () => {
    // The provider ignores the cancellation and answers anyway.
    api.weekSteps.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ steps: [steady, steady] }), 20),
        ),
    );
    await render(4);
    await act(async () => button('ai_plan_steps_run').click());
    await waitFor(() => api.weekSteps.mock.calls.length >= 2);
    await act(async () => button('ai_plan_steps_stop').click());
    await waitFor(
      () => !!container.textContent?.includes('ai_plan_steps_stopped'),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(api.weekSteps).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('ai_plan_steps_stopped');
  });

  it('describes every check result', () => {
    expect(
      issueText({ code: 'PROGRESSION', week: 3, value: 300, limit: 250 }),
    ).toBe(
      'ai_plan_issue_progression {"week":"3","session":"","value":"300","limit":"250"}',
    );
    expect(issueText({ code: 'WEEK_NUMBERS' })).toBe(
      'ai_plan_issue_week_numbers',
    );
  });
});
