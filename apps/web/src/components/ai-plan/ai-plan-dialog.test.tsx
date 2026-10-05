// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AiErrorCode,
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
  races: vi.fn(),
  context: vi.fn(),
}));

vi.mock('@/api/ai-plan/ai-plan.api', () => ({
  AiPlanAPI: {
    start: api.start,
    status: api.status,
    weekSteps: api.weekSteps,
    races: api.races,
    context: api.context,
  },
}));
const calendarRaces = [
  {
    eventId: 51,
    name: 'Autumn 5K',
    startDate: '2030-11-16T09:00:00.000Z',
    sport: 'TRAIL_RUNNING',
    distance: 5000,
    elevationGain: 120,
    timeTarget: 1200,
  },
];
const preview = {
  athlete: {
    recentWeeklyMinutes: 150,
    weeklyHistoryNewestFirst: [3, 4, 2, 3, 0, 0, 0, 0].map((sessions) => ({
      minutes: sessions * 50,
      sessions,
    })),
    minutesBySportLast8Weeks: { RUNNING: 600 },
    metrics: { HR_MAX: 190 },
    zones: 'HEARTRATE Zones: ...',
    injuries: [
      { location: 'knee', painScore: 3, status: 'STABLE', context: '' },
    ],
    races: [
      {
        name: 'Autumn 5K',
        date: '2030-11-16T09:00:00.000Z',
        dayInPlan: 26,
        sport: 'TRAIL_RUNNING',
        distance: 5000,
        elevationGain: 120,
        timeTarget: 1200,
        description: null,
        priority: 'PREPARATORY',
        goal: false,
      },
      {
        name: 'City 10K',
        date: '2030-11-02T08:00:00.000Z',
        dayInPlan: 12,
        sport: 'RUNNING',
        distance: 10000,
        elevationGain: null,
        timeTarget: 2700,
        description: null,
        priority: null,
        goal: true,
      },
    ],
  },
  zoneTypes: ['HEARTRATE'],
  conflicts: {
    sessions: 2,
    plans: [
      {
        trainingPlanId: 7,
        name: 'Old plan',
        startDate: '2030-09-01T00:00:00Z',
        endDate: '2030-11-01T00:00:00Z',
        status: 'ACTIVE',
      },
    ],
  },
};
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
        races: [
          ['City 10K', '2030-11-02'],
          ['Winter half', '2030-12-07'],
          ['Early 5K', '2030-10-19'],
        ].map(([name, day], index) => ({
          priority: 'PREPARATORY',
          competition: {
            event: {
              eventId: 60 + index,
              name,
              startDate: `${day}T08:00:00Z`,
              endDate: `${day}T10:00:00Z`,
            },
          },
        })),
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
    api.races.mockResolvedValue(calendarRaces);
    api.context.mockResolvedValue(preview);
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

  const summary = () =>
    dialog().querySelector('section[aria-label="ai_plan_context"]')!;

  it('shows what the AI will use for the dates, and refuses plans over 24 weeks', async () => {
    // Nothing to show until the dates are chosen.
    expect(summary().textContent).toContain('ai_plan_context_dates');
    await fillValid();
    await waitFor(() =>
      summary().textContent!.includes('ai_plan_context_training_value'),
    );
    expect(api.context).toHaveBeenLastCalledWith(
      expect.objectContaining({
        athleteId: 4,
        goalEventId: null,
        startDate: '2030-10-21',
        raceDate: '2030-11-02',
      }),
    );
    const text = summary().textContent!;
    expect(text).toContain(
      // The locale is Spanish in these tests.
      'ai_plan_context_training_value {"hours":"2,5","sessions":"12"}',
    );
    expect(text).toContain('metric_hr_max 190');
    expect(text).toContain('heart_rate');
    expect(text).toContain('knee (injury_status_stable, 3/10)');
    expect(text).toContain('Autumn 5K');
    expect(text).toContain('ai_plan_context_race_preparatory');
    expect(text).toMatch(/City 10K · [^·]+ · ai_plan_context_race_goal/);
    expect(text).toContain(
      'ai_plan_context_calendar_sessions {"count":"2"} · Old plan',
    );
    // The typed goal name reaches the context once typing settles.
    await waitFor(() =>
      api.context.mock.calls.some((call) => call[0].goalName === '10K'),
    );
    expect(api.context).toHaveBeenCalledWith(
      expect.objectContaining({ goalName: '10K' }),
    );

    await type('ai_plan_race_date', '2031-04-07');
    expect(summary().textContent).toContain('ai_plan_context_dates');
    await submit();
    expect(dialog().textContent).toContain('ai_plan_error_length');
    expect(api.start).not.toHaveBeenCalled();
  });

  it('fills the goal from a race in the calendar and links it on import', async () => {
    api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
    api.status.mockResolvedValue({
      jobId: 'job-1',
      state: 'done',
      draft: draft({ raceDate: '2030-11-16' }),
    });
    api.importJson.mockResolvedValue({ trainingPlanId: 12, name: 'Plan 10K' });
    await waitFor(() => !!dialog().querySelector('select option[value="51"]'));
    await type('ai_plan_goal_pick', '51');
    expect((field('ai_plan_goal_name') as HTMLInputElement).value).toBe(
      'Autumn 5K',
    );
    expect((field('ai_plan_race_date') as HTMLInputElement).value).toBe(
      '2030-11-16',
    );
    expect((field('ai_plan_goal_sport') as HTMLSelectElement).value).toBe(
      'TRAIL_RUNNING',
    );
    expect((field('ai_plan_distance') as HTMLInputElement).value).toBe('5');
    expect((field('ai_plan_elevation') as HTMLInputElement).value).toBe('120');
    expect((field('ai_plan_time_target') as HTMLInputElement).value).toBe(
      '00:20:00',
    );
    await type('ai_plan_start_date', '2030-10-21');
    await waitFor(() =>
      api.context.mock.calls.some((call) => call[0].goalEventId === 51),
    );
    expect(api.context).toHaveBeenCalledWith(
      expect.objectContaining({ goalEventId: 51, raceDate: '2030-11-16' }),
    );
    await submit();
    expect(api.start).toHaveBeenCalledWith(
      expect.objectContaining({
        goalEventId: 51,
        goal: expect.objectContaining({
          name: 'Autumn 5K',
          date: '2030-11-16',
          sport: 'TRAIL_RUNNING',
          distanceKm: 5,
          elevationGain: 120,
          timeTarget: 1200,
        }),
      }),
    );
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
    await act(async () => publish.click());
    await waitFor(() => onImported.mock.calls.length > 0);
    expect(api.importJson).toHaveBeenCalledWith(
      expect.objectContaining({ goalEventId: 51, status: 'DRAFT' }),
    );
  });

  it('forgets the calendar race when its date is changed', async () => {
    await waitFor(() => !!dialog().querySelector('select option[value="51"]'));
    await type('ai_plan_goal_pick', '51');
    expect((field('ai_plan_goal_pick') as HTMLSelectElement).value).toBe('51');
    await type('ai_plan_race_date', '2030-11-23');
    expect((field('ai_plan_goal_pick') as HTMLSelectElement).value).toBe('');
    // What was filled in stays, as a typed race.
    expect((field('ai_plan_goal_name') as HTMLInputElement).value).toBe(
      'Autumn 5K',
    );
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
        // Another race, typed: no calendar race to link.
        goalEventId: null,
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
    // Replacing it keeps its races; one falls after the new plan's end.
    await act(async () => {
      const destination = dialog().querySelector<HTMLSelectElement>(
        'select[aria-label="json_plan_destination"]',
      )!;
      destination.value = '2';
      destination.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const status = [...dialog().querySelectorAll('[role="status"]')]
      .map((item) => item.textContent)
      .find((text) => text?.includes('json_plan_replace_warning'));
    expect(status).toContain(
      'json_plan_races_kept {"races":"City 10K, Winter half, Early 5K"}',
    );
    // One after the new plan's end, one before its start.
    expect(status).toContain('json_plan_race_unlinked {"name":"Winter half"}');
    expect(status).toContain('json_plan_race_unlinked {"name":"Early 5K"}');
    expect(status).not.toContain('json_plan_race_unlinked {"name":"City 10K"}');
  });

  it('shows a progress bar and the estimated time while writing', async () => {
    api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
    api.status.mockResolvedValue({
      jobId: 'job-1',
      state: 'running',
      stage: 'generating',
    });
    await fillValid();
    await submit();
    await waitFor(() => !!dialog().querySelector('[role="progressbar"]'));
    const bar = dialog().querySelector('[role="progressbar"]')!;
    await waitFor(() => Number(bar.getAttribute('aria-valuenow')) >= 5);
    expect(bar.getAttribute('aria-label')).toBe('ai_plan_progress_label');
    // Being written, but never complete before the draft arrives.
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(5);
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeLessThan(90);
    // Two weeks of three sessions: well under a minute, shown as one.
    expect(dialog().textContent).toContain('ai_plan_estimate {"minutes":"1"}');
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
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(
      'ai_plan_failed',
    );
    expect((field('ai_plan_goal_name') as HTMLInputElement).value).toBe('10K');
  });

  it.each([
    ['QUOTA', '429 insufficient_quota', 'ai_plan_failed_quota'],
    ['AUTH', '401 invalid_api_key', 'ai_plan_failed_auth'],
    ['RATE_LIMIT', '429 rate_limit_exceeded', 'ai_plan_failed_rate_limit'],
    ['UNAVAILABLE', '529 overloaded_error', 'ai_plan_failed_unavailable'],
    ['TIMEOUT', undefined, 'ai_plan_failed_timeout'],
    ['INVALID_ANSWER', 'TRUNCATED', 'ai_plan_failed_invalid'],
    ['PROVIDER_ERROR', '404 model_not_found', 'ai_plan_failed_provider'],
  ])('explains a %s failure', async (reason, detail, message) => {
    api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
    api.status.mockResolvedValue({
      jobId: 'job-1',
      state: 'failed',
      reason,
      ...(detail ? { detail } : {}),
    });
    await fillValid();
    await submit();
    await waitFor(() => !!dialog().querySelector('[role="alert"]'));
    const alert = dialog().querySelector('[role="alert"]')!.textContent;
    expect(alert).toContain(message);
    if (detail)
      expect(alert).toContain(
        `ai_plan_failed_detail ${JSON.stringify({ detail })}`,
      );
    else expect(alert).not.toContain('ai_plan_failed_detail');
  });

  it.each([
    ['QUOTA', 'own_key', 'ai_plan_failed_quota_own'],
    ['QUOTA', 'hosted', 'ai_plan_failed_quota'],
    ['AUTH', 'own_key', 'ai_plan_failed_auth_own'],
    ['AUTH', 'hosted', 'ai_plan_failed_auth'],
    ['NOT_CONFIGURED', undefined, 'ai_error_not_configured'],
  ])(
    'says whose account to fix after a %s failure on %s',
    async (reason, source, message) => {
      api.start.mockResolvedValue({ jobId: 'job-1', state: 'queued' });
      api.status.mockResolvedValue({
        jobId: 'job-1',
        state: 'failed',
        reason,
        ...(source ? { source } : {}),
      });
      await fillValid();
      await submit();
      await waitFor(() => !!dialog().querySelector('[role="alert"]'));
      expect(dialog().querySelector('[role="alert"] p')!.textContent).toBe(
        message,
      );
    },
  );

  it('points to Settings > AI when no AI is set up for plans', async () => {
    api.start.mockRejectedValue(
      new AxiosError('Forbidden', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 403,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { code: AiErrorCode.NOT_CONFIGURED },
      }),
    );
    await fillValid();
    await submit();
    await waitFor(() => vi.mocked(toast.error).mock.calls.length > 0);
    expect(toast.error).toHaveBeenCalledWith('ai_error_not_configured');
  });
});
