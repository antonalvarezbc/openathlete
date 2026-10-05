/* eslint-disable react-refresh/only-export-components */
import { AiPlanAPI } from '@/api/ai-plan';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { aiErrorCode, aiErrorMessage } from '@/utils/ai-errors';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { z } from 'zod';

import {
  AI_PLAN_MAX_WEEK_SESSIONS,
  AI_PLAN_RULES,
  AI_PLAN_RULE_KEYS,
  AiErrorCode,
  AiPlanCheckFacts,
  AiPlanConflicts,
  AiPlanIssue,
  AiPlanRuleKey,
  AiPlanRuleNote,
  AiPlanRules,
  SEOPlanData,
  applyAiPlanRules,
  planWorkoutStepSchema,
} from '@openathlete/shared';

/** An AI draft opened in the plan review dialog. */
export interface AiPlanReviewDraft {
  plan: SEOPlanData;
  athleteId: number;
  startDate: string;
  /** The goal race from the calendar, linked as the plan's target race */
  goalEventId?: number | null;
  facts: AiPlanCheckFacts;
  rules: AiPlanRules;
  ruleNotes: AiPlanRuleNote[];
  conflicts: AiPlanConflicts;
}

function ruleLabel(rule: AiPlanRuleKey) {
  switch (rule) {
    case 'growthPercent':
      return m.ai_plan_rule_growth_percent();
    case 'growthMinutes':
      return m.ai_plan_rule_growth_minutes();
    case 'maxLoadingWeeks':
      return m.ai_plan_rule_max_loading_weeks();
    case 'recoveryDropPercent':
      return m.ai_plan_rule_recovery_drop();
    case 'taperLastWeekPercent':
      return m.ai_plan_rule_taper_last_week();
    case 'taperWeekBeforePercent':
      return m.ai_plan_rule_taper_week_before();
    case 'hoursAllowancePercent':
      return m.ai_plan_rule_hours_allowance();
    case 'injuryMaxRpe':
      return m.ai_plan_rule_injury_rpe();
  }
}

/**
 * The limits the checks use: their source, the AI's reason, and any value
 * clamped to the safety bounds. The coach can change them within the same
 * bounds; the checks run again on every change.
 */
export function AiPlanRulesEditor({
  rules,
  notes,
  onChange,
}: {
  rules: AiPlanRules;
  notes: AiPlanRuleNote[];
  onChange: (rules: AiPlanRules, notes: AiPlanRuleNote[]) => void;
}) {
  const apply = (rule: AiPlanRuleKey, text: string) => {
    const value = text.trim() === '' ? NaN : Number(text.replace(',', '.'));
    if (value === rules[rule]) return;
    const next = applyAiPlanRules([{ rule, value }], rules, 'coach');
    onChange(
      next.rules,
      notes.map((note) =>
        note.rule === rule ? next.notes.find((n) => n.rule === rule)! : note,
      ),
    );
  };
  return (
    <section aria-label={m.ai_plan_rules()} className="space-y-2">
      <h3 className="font-semibold">{m.ai_plan_rules()}</h3>
      <p className="text-sm text-muted-foreground">{m.ai_plan_rules_help()}</p>
      <ul className="space-y-3">
        {AI_PLAN_RULE_KEYS.map((rule) => {
          const note = notes.find((item) => item.rule === rule);
          const { min, max } = AI_PLAN_RULES[rule];
          return (
            <li key={rule} className="space-y-1 text-sm" data-rule={rule}>
              <label className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{ruleLabel(rule)}</span>
                <input
                  key={`${rule}-${rules[rule]}`}
                  type="number"
                  inputMode="numeric"
                  min={min}
                  max={max}
                  step={1}
                  defaultValue={rules[rule]}
                  className="h-11 w-24 rounded-md border bg-background px-3 text-base"
                  onBlur={(event) => apply(rule, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </label>
              <p className="text-muted-foreground">
                {note?.source === 'ai'
                  ? note.reason
                    ? m.ai_plan_rule_source_ai({ reason: note.reason })
                    : m.ai_plan_rule_source_ai_no_reason()
                  : note?.source === 'coach'
                    ? m.ai_plan_rule_source_coach()
                    : m.ai_plan_rule_source_default()}{' '}
                {m.ai_plan_rule_bounds({ min: String(min), max: String(max) })}
              </p>
              {note?.requested !== undefined && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-amber-700 dark:text-amber-400"
                >
                  <TriangleAlert className="size-4 shrink-0" />
                  {m.ai_plan_rule_clamped({
                    requested: Number.isFinite(note.requested)
                      ? String(note.requested)
                      : '—',
                    value: String(rules[rule]),
                  })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Weeks structured at the same time; each request is one week. */
const WEEK_CONCURRENCY = 2;
const stepsSchema = z.array(planWorkoutStepSchema).min(1).max(100);

export function issueText(issue: AiPlanIssue) {
  const params = {
    week: String(issue.week ?? ''),
    session: issue.session ?? '',
    value: String(issue.value ?? ''),
    limit: String(issue.limit ?? ''),
  };
  switch (issue.code) {
    case 'WEEK_COUNT':
      return m.ai_plan_issue_week_count(params);
    case 'WEEK_NUMBERS':
      return m.ai_plan_issue_week_numbers();
    case 'MISSING_DURATION':
      return m.ai_plan_issue_missing_duration(params);
    case 'AFTER_RACE':
      return m.ai_plan_issue_after_race(params);
    case 'DAY_NOT_AVAILABLE':
      return m.ai_plan_issue_day_not_available(params);
    case 'TOO_MANY_SESSIONS':
      return m.ai_plan_issue_too_many_sessions(params);
    case 'SPORT_NOT_ALLOWED':
      return m.ai_plan_issue_sport_not_allowed(params);
    case 'WEEK_TOO_LONG':
      return m.ai_plan_issue_week_too_long(params);
    case 'FIRST_WEEK':
      return m.ai_plan_issue_first_week(params);
    case 'PROGRESSION':
      return m.ai_plan_issue_progression(params);
    case 'NO_RECOVERY':
      return m.ai_plan_issue_no_recovery(params);
    case 'NO_TAPER':
      return m.ai_plan_issue_no_taper(params);
    case 'INJURY_INTENSITY':
      return m.ai_plan_issue_injury_intensity(params);
    case 'UNKNOWN_ZONE':
      return m.ai_plan_issue_unknown_zone(params);
    case 'UNKNOWN_METRIC':
      return m.ai_plan_issue_unknown_metric(params);
  }
}

/** What the automatic checks found, and what is already in those dates. */
export function AiPlanChecks({
  issues,
  conflicts,
}: {
  issues: AiPlanIssue[];
  conflicts: AiPlanConflicts;
}) {
  const date = (value: string) =>
    new Date(value).toLocaleDateString(getLocale());
  return (
    <section aria-label={m.ai_plan_checks()} className="space-y-2">
      <h3 className="font-semibold">{m.ai_plan_checks()}</h3>
      {issues.length ? (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 shrink-0" />
            {m.ai_plan_checks_fix()}
          </p>
          <ul className="list-disc space-y-1 pl-6">
            {issues.map((issue, index) => (
              <li key={index}>{issueText(issue)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-green-600" />
          {m.ai_plan_checks_ok()}
        </p>
      )}
      {conflicts.sessions > 0 && (
        <p className="text-sm">
          {m.ai_plan_conflict_sessions({ count: String(conflicts.sessions) })}
        </p>
      )}
      {conflicts.plans.length > 0 && (
        <p className="text-sm">
          {m.ai_plan_conflict_plans({
            plans: conflicts.plans
              .map(
                (plan) =>
                  `${plan.name} (${date(plan.startDate)} – ${date(plan.endDate)})`,
              )
              .join(', '),
          })}
        </p>
      )}
    </section>
  );
}

type StepsProgress = {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  stopped: boolean;
  /** No AI for written workouts, or its key refused: every week would fail */
  error: string | null;
};

const ACCOUNT_ERRORS: (AiErrorCode | null)[] = [
  AiErrorCode.NOT_CONFIGURED,
  AiErrorCode.CREDENTIAL_REJECTED,
  AiErrorCode.QUOTA_EXCEEDED,
];

/**
 * Turns the sessions' descriptions into structured steps, week by week, and
 * hands back the plan after each week so progress is visible and kept if
 * stopped. A session the AI cannot structure keeps its description only.
 */
export function AiPlanSteps({
  plan,
  athleteId,
  onPlan,
  onRunningChange,
}: {
  plan: SEOPlanData;
  athleteId: number;
  onPlan: (plan: SEOPlanData) => void;
  onRunningChange: (running: boolean) => void;
}) {
  const [progress, setProgress] = useState<StepsProgress | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function run() {
    const abort = new AbortController();
    controller.current = abort;
    const working: SEOPlanData = structuredClone(plan);
    const weeks = working.cycles.flatMap((cycle) => cycle.weeks);
    const state: StepsProgress = {
      running: true,
      done: 0,
      total: weeks.length,
      failed: 0,
      stopped: false,
      error: null,
    };
    setProgress({ ...state });
    onRunningChange(true);
    let next = 0;
    const worker = async () => {
      while (next < weeks.length && !abort.signal.aborted) {
        const week = weeks[next++];
        const pending = week.sessions.filter(
          (session) =>
            !session.workout?.steps?.length &&
            (session.description || session.name).trim(),
        );
        for (let i = 0; i < pending.length; i += AI_PLAN_MAX_WEEK_SESSIONS) {
          const chunk = pending.slice(i, i + AI_PLAN_MAX_WEEK_SESSIONS);
          try {
            const { steps } = await AiPlanAPI.weekSteps(
              {
                athleteId,
                sessions: chunk.map((session) => ({
                  sport: session.sport,
                  text: (session.description || session.name)
                    .trim()
                    .slice(0, 1000),
                })),
              },
              abort.signal,
            );
            chunk.forEach((session, index) => {
              const parsed = stepsSchema.safeParse(steps[index]);
              if (parsed.success) session.workout = { steps: parsed.data };
              else state.failed++;
            });
          } catch (error) {
            if (abort.signal.aborted) return;
            if (ACCOUNT_ERRORS.includes(aiErrorCode(error))) {
              state.error = aiErrorMessage(error);
              abort.abort();
              return;
            }
            state.failed += chunk.length;
          }
        }
        state.done++;
        setProgress({ ...state });
        onPlan(structuredClone(working));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(WEEK_CONCURRENCY, weeks.length) }, worker),
    );
    state.running = false;
    state.stopped = abort.signal.aborted;
    setProgress({ ...state });
    onRunningChange(false);
  }

  return (
    <section aria-label={m.ai_plan_steps()} className="space-y-2">
      <h3 className="font-semibold">{m.ai_plan_steps()}</h3>
      <p className="text-sm text-muted-foreground">{m.ai_plan_steps_help()}</p>
      <div className="flex flex-wrap items-center gap-2">
        {progress?.running ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => controller.current?.abort()}
          >
            {m.ai_plan_steps_stop()}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={run}
          >
            {m.ai_plan_steps_run()}
          </Button>
        )}
      </div>
      {progress && (
        <div role="status" className="space-y-1 text-sm">
          <p>
            {progress.running
              ? m.ai_plan_steps_progress({
                  done: String(progress.done),
                  total: String(progress.total),
                })
              : progress.stopped
                ? m.ai_plan_steps_stopped()
                : m.ai_plan_steps_done({
                    done: String(progress.done),
                    total: String(progress.total),
                  })}
          </p>
          {progress.error && (
            <p role="alert" className="text-destructive">
              {progress.error}
            </p>
          )}
          {progress.failed > 0 && (
            <p className="text-muted-foreground">
              {m.ai_plan_steps_failed({ count: String(progress.failed) })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
