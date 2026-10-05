// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AiPlanDraft,
  AiPlanRuleNote,
  CYCLE_PHASE,
  DEFAULT_AI_PLAN_RULES,
  SEOPlanData,
  SPORT_TYPE,
} from '@openathlete/shared';

import { AiPlanDialog } from './ai-plan-dialog';

const api = vi.hoisted(() => ({
  start: vi.fn(),
  status: vi.fn(),
  weekSteps: vi.fn(),
  importJson: vi.fn(),
}));

vi.mock('@/api/ai-plan/ai-plan.api', () => ({
  AiPlanAPI: {
    start: api.start,
    status: api.status,
    weekSteps: api.weekSteps,
  },
}));
vi.mock('@/api/seo-plan', () => ({
  SeoPlanAPI: {
    importJson: api.importJson,
    listPlans: vi.fn().mockResolvedValue([
      {
        trainingPlanId: 1,
        name: 'Past plan',
        startDate: '2020-01-06T00:00:00Z',
        endDate: '2020-03-01T00:00:00Z',
      },
      {
        trainingPlanId: 2,
        name: 'Future plan',
        startDate: '2099-01-05T00:00:00Z',
        endDate: '2099-03-01T00:00:00Z',
      },
    ]),
  },
  useGetTemporaryPlan: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/api/athlete', () => ({
  useGetMyAthleteQuery: () => ({
    data: { athleteId: 4, user: { firstName: 'Ana', lastName: 'Runner' } },
  }),
  useGetMyCoachedAthletesQuery: () => ({ data: [] }),
}));
vi.mock('@/api/injury', () => ({
  useGetInjuriesQuery: () => ({
    data: [
      { location: 'knee', status: 'STABLE' },
      { location: 'ankle', status: 'RESOLVED' },
    ],
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Every message renders as its key, followed by its parameters.
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

/** Two weeks to a Saturday race, within every check. */
const plan = (weekMinutes = [120, 60]): SEOPlanData => ({
  plan: {
    name: 'Plan 10K',
    description: 'Polarized',
    goal: '10K',
    sportType: SPORT_TYPE.RUNNING,
    distance: 10000,
    duration: 2,
  },
  cycles: [
    {
      name: 'Build',
      description: '',
      phase: CYCLE_PHASE.BASE,
      weeks: weekMinutes.map((minutes, index) => ({
        weekNumber: index + 1,
        theme: null,
        sessions: [2, 4].map((dayOfWeek) => ({
          dayOfWeek,
          name: `Run ${index + 1}.${dayOfWeek}`,
          sport: SPORT_TYPE.RUNNING,
          description: "10' warm-up + 20' easy",
          goalDuration: (minutes / 2) * 60,
          goalRpe: 4,
        })),
      })),
    },
  ],
});
const defaultNotes = (): AiPlanRuleNote[] =>
  Object.keys(DEFAULT_AI_PLAN_RULES).map((rule) => ({
    rule: rule as AiPlanRuleNote['rule'],
    source: 'default',
  }));
const draft = (
  overrides: Partial<AiPlanDraft['facts']> = {},
  extra: Partial<AiPlanDraft> = {},
): AiPlanDraft => ({
  plan: plan(),
  issues: [],
  rules: DEFAULT_AI_PLAN_RULES,
  ruleNotes: defaultNotes(),
  facts: {
    startDate: '2030-10-21',
    raceDate: '2030-11-02',
    weeks: 2,
    sports: [SPORT_TYPE.RUNNING],
    trainingDays: [2, 4, 6],
    weeklyHours: 5,
    injuries: 0,
    zoneNumbers: [],
    metrics: [],
    recentWeeklyMinutes: null,
    ...overrides,
  },
  conflicts: { sessions: 3, plans: [] },
  ...extra,
});

describe('AiPlanDialog', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onImported = vi.fn();
  const onClose = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <AiPlanDialog
            athleteId={4}
            onClose={onClose}
            onImported={onImported}
            pollMs={5}
          />
        </QueryClientProvider>,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const dialog = () => document.body.querySelector('[role="dialog"]')!;
  const waitFor = async (check: () => boolean) => {
    for (let tries = 0; tries < 200 && !check(); tries++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
  };
  const field = (label: string) =>
    [...dialog().querySelectorAll('label')]
      .find((item) => item.textContent?.startsWith(label))!
      .querySelector('input, select, textarea') as
      HTMLInputElement | HTMLSelectElement;
  const type = (label: string, value: string) =>
    act(async () => {
      const input = field(label);
      const prototype =
        input instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
        input,
        value,
      );
      input.dispatchEvent(
        new Event(input instanceof HTMLSelectElement ? 'change' : 'input', {
          bubbles: true,
        }),
      );
    });
  const toggle = (label: string) =>
    act(async () => {
      [...dialog().querySelectorAll('label')]
        .find((item) => item.textContent === label)!
        .querySelector('input')!
        .click();
    });
  const submit = () =>
    act(async () => {
      dialog()
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  const fillValid = async () => {
    await type('ai_plan_goal_name', '10K');
    await type('ai_plan_race_date', '2030-11-02');
    await type('ai_plan_start_date', '2030-10-21');
  };

  it('shows unresolved injuries and refuses plans over 24 weeks', async () => {
    expect(dialog().textContent).toContain(
      'ai_plan_injuries {"injuries":"knee"}',
    );
    await fillValid();
    await type('ai_plan_race_date', '2031-04-07');
    await submit();
    expect(dialog().textContent).toContain('ai_plan_error_length');
    expect(api.start).not.toHaveBeenCalled();
  });

  it("queues the coach's answers and follows the draft to the review", async () => {
    api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
    api.status
      .mockResolvedValueOnce({
        jobId: 'job-1',
        state: 'running',
        stage: 'repairing',
      })
      .mockResolvedValue({ jobId: 'job-1', state: 'done', draft: draft() });
    await fillValid();
    await type('ai_plan_distance', '10');
    await type('ai_plan_time_target', '00:45:00');
    await type('ai_plan_weekly_hours', '6');
    await type('ai_plan_methodology', 'POLARIZED');
    await toggle('cycling');
    await submit();

    expect(api.start).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: 4,
        goal: expect.objectContaining({
          name: '10K',
          date: '2030-11-02',
          sport: 'RUNNING',
          distanceKm: 10,
          timeTarget: 2700,
        }),
        startDate: '2030-10-21',
        sports: ['RUNNING', 'CYCLING'],
        trainingDays: [2, 4, 6],
        weeklyHours: 6,
        methodology: 'POLARIZED',
        language: 'es',
      }),
    );
    await waitFor(() =>
      dialog()?.textContent?.includes('ai_plan_review_title'),
    );
    expect(dialog().textContent).toContain('ai_plan_checks_ok');
    expect(dialog().textContent).toContain(
      'ai_plan_conflict_sessions {"count":"3"}',
    );
    // The draft was built for this athlete and these dates.
    expect(
      dialog().querySelector<HTMLSelectElement>('select[aria-label="athlete"]')!
        .disabled,
    ).toBe(true);
    // Only a future plan can be replaced.
    await waitFor(
      () =>
        dialog().querySelectorAll(
          'select[aria-label="json_plan_destination"] option',
        ).length > 1,
    );
    expect(
      [
        ...dialog().querySelectorAll(
          'select[aria-label="json_plan_destination"] option',
        ),
      ].map((option) => option.textContent?.split(' · ')[0]),
    ).toEqual(['json_plan_new', 'Future plan']);
  });

  it('imports the reviewed draft as DRAFT and selects it', async () => {
    api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
    api.status.mockResolvedValue({
      jobId: 'job-1',
      state: 'done',
      draft: draft(),
    });
    api.importJson.mockResolvedValue({ trainingPlanId: 12, name: 'Plan 10K' });
    await fillValid();
    await submit();
    await waitFor(() =>
      dialog()?.textContent?.includes('ai_plan_review_title'),
    );
    await act(async () => {
      dialog()
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click();
    });
    const publish = [...dialog().querySelectorAll('button')].find(
      (button) => button.textContent === 'json_plan_publish',
    )!;
    expect(publish.disabled).toBe(false);
    await act(async () => publish.click());
    await waitFor(() => onImported.mock.calls.length > 0);
    expect(api.importJson).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: 4,
        startDate: '2030-10-21',
        status: 'DRAFT',
        planData: expect.objectContaining({
          plan: expect.objectContaining({ name: 'Plan 10K' }),
        }),
      }),
    );
    expect(onImported).toHaveBeenCalledWith({
      trainingPlanId: 12,
      name: 'Plan 10K',
    });
  });

  it('blocks the import while the checks find problems', async () => {
    api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
    api.status.mockResolvedValue({
      jobId: 'job-1',
      state: 'done',
      draft: draft({ weeklyHours: 1 }),
    });
    await fillValid();
    await submit();
    await waitFor(() =>
      dialog()?.textContent?.includes('ai_plan_review_title'),
    );
    expect(dialog().textContent).toContain('ai_plan_checks_fix');
    expect(dialog().textContent).toContain('ai_plan_issue_week_too_long');
    await act(async () => {
      dialog()
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click();
    });
    const publish = [...dialog().querySelectorAll('button')].find(
      (button) => button.textContent === 'json_plan_publish',
    )!;
    expect(publish.disabled).toBe(true);
  });

  const openReview = async (value: AiPlanDraft) => {
    api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
    api.status.mockResolvedValue({
      jobId: 'job-1',
      state: 'done',
      draft: value,
    });
    await fillValid();
    await submit();
    await waitFor(() =>
      dialog()?.textContent?.includes('ai_plan_review_title'),
    );
  };
  const rule = (name: string) =>
    dialog().querySelector<HTMLElement>(`[data-rule="${name}"]`)!;

  it('shows each rule in effect: default, set by the AI, or clamped', async () => {
    const notes = defaultNotes().map((note) =>
      note.rule === 'growthPercent'
        ? { ...note, source: 'ai' as const, reason: 'Progresión del 15 %' }
        : note.rule === 'taperLastWeekPercent'
          ? { ...note, source: 'ai' as const, requested: 10 }
          : note,
    );
    await openReview(
      draft(
        {},
        {
          rules: {
            ...DEFAULT_AI_PLAN_RULES,
            growthPercent: 15,
            taperLastWeekPercent: 40,
          },
          ruleNotes: notes,
        },
      ),
    );
    expect(rule('growthPercent').querySelector('input')!.value).toBe('15');
    expect(rule('growthPercent').textContent).toContain(
      'ai_plan_rule_source_ai {"reason":"Progresión del 15 %"}',
    );
    expect(rule('taperLastWeekPercent').textContent).toContain(
      'ai_plan_rule_clamped {"requested":"10","value":"40"}',
    );
    expect(rule('growthMinutes').textContent).toContain(
      'ai_plan_rule_source_default',
    );
    expect(rule('growthMinutes').textContent).toContain(
      'ai_plan_rule_bounds {"min":"0","max":"30"}',
    );
  });

  it('re-runs the checks when the coach edits a rule, within the bounds', async () => {
    // 120 min in week 1 with 1.8 h asked for: over the default 10% margin.
    await openReview(draft({ weeklyHours: 1.8 }));
    expect(dialog().textContent).toContain('ai_plan_issue_week_too_long');
    const input = rule('hoursAllowancePercent').querySelector('input')!;
    await act(async () => {
      input.value = '50';
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    // Limited to the 20% bound, which is enough for 120 min.
    expect(rule('hoursAllowancePercent').querySelector('input')!.value).toBe(
      '20',
    );
    expect(rule('hoursAllowancePercent').textContent).toContain(
      'ai_plan_rule_clamped {"requested":"50","value":"20"}',
    );
    expect(rule('hoursAllowancePercent').textContent).toContain(
      'ai_plan_rule_source_coach',
    );
    expect(dialog().textContent).toContain('ai_plan_checks_ok');
    await act(async () => {
      dialog()
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click();
    });
    const publish = [...dialog().querySelectorAll('button')].find(
      (button) => button.textContent === 'json_plan_publish',
    )!;
    expect(publish.disabled).toBe(false);
    // A stricter rule brings the problem back.
    const again = rule('hoursAllowancePercent').querySelector('input')!;
    await act(async () => {
      again.value = '0';
      again.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(dialog().textContent).toContain('ai_plan_issue_week_too_long');
  });

  it('goes back to the answers when the draft fails', async () => {
    api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
    api.status.mockResolvedValue({ jobId: 'job-1', state: 'failed' });
    await fillValid();
    await submit();
    await waitFor(() => dialog().textContent!.includes('ai_plan_failed'));
    expect((field('ai_plan_goal_name') as HTMLInputElement).value).toBe('10K');
  });
});
