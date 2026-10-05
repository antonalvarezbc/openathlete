import {
  useGetMyAthleteQuery,
  useGetMyCoachedAthletesQuery,
} from '@/api/athlete';
import { cycleKeys } from '@/api/cycle/cycle.keys';
import { eventKeys } from '@/api/event/event.keys';
import { SeoPlanAPI, useGetTemporaryPlan } from '@/api/seo-plan';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { sportTypeLabelMap } from '@/utils/label-map/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  SEOPlanData,
  buildPlanSchedule,
  checkAiPlan,
  trainingPlanImportSchema,
} from '@openathlete/shared';

import {
  AiPlanChecks,
  AiPlanReviewDraft,
  AiPlanRulesEditor,
  AiPlanSteps,
} from '../ai-plan/ai-plan-review';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import {
  TRAINING_PLAN_EXAMPLE_FILE,
  TRAINING_PLAN_EXAMPLE_TEXT,
} from './training-plan-example';

interface ImportPlanDialogProps {
  open: boolean;
  onClose: () => void;
  planToken?: string;
  /** An AI draft: reviewed for its athlete and dates, imported as DRAFT. */
  draft?: AiPlanReviewDraft;
  onImported?: (plan: { trainingPlanId: number; name: string }) => void;
}

export function ImportPlanDialog({
  open,
  onClose,
  planToken,
  draft,
  onImported,
}: ImportPlanDialogProps) {
  const { data: ownAthlete } = useGetMyAthleteQuery();
  const { data: coachedAthletes = [] } = useGetMyCoachedAthletesQuery();
  const temporary = useGetTemporaryPlan(planToken ?? null);
  const [text, setText] = useState(() =>
    draft ? JSON.stringify(draft.plan, null, 2) : '',
  );
  const [fileError, setFileError] = useState('');
  const [athleteId, setAthleteId] = useState(() =>
    draft ? String(draft.athleteId) : '',
  );
  const [replacePlanId, setReplacePlanId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [structuring, setStructuring] = useState(false);
  // The plan's rules; the coach may change them within the safety bounds.
  const [rules, setRules] = useState(draft?.rules);
  const [ruleNotes, setRuleNotes] = useState(draft?.ruleNotes ?? []);
  const [startDate, setStartDate] = useState(() => {
    if (draft) return draft.startDate;
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const queryClient = useQueryClient();
  const athletes = [ownAthlete, ...coachedAthletes].filter(
    (athlete, index, list) =>
      athlete &&
      list.findIndex((item) => item?.athleteId === athlete.athleteId) === index,
  );
  const plans = useQuery({
    queryKey: ['json-plans', athleteId],
    queryFn: () => SeoPlanAPI.listPlans(Number(athleteId)),
    enabled: !!athleteId,
  });
  useEffect(() => {
    if (temporary.data) setText(JSON.stringify(temporary.data, null, 2));
  }, [temporary.data]);
  const preview = useMemo(() => {
    if (!text.trim()) return { error: '', plan: null, schedule: null };
    try {
      const parsed = trainingPlanImportSchema.safeParse(JSON.parse(text));
      if (!parsed.success)
        return {
          error: parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('\n'),
          plan: null,
          schedule: null,
        };
      return {
        plan: parsed.data,
        schedule: buildPlanSchedule(parsed.data, startDate, timeZone),
        error: '',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : m.json_plan_invalid(),
        plan: null,
        schedule: null,
      };
    }
  }, [text, startDate, timeZone]);
  // The same checks as the API, again on every edit of an AI draft.
  const issues = useMemo(
    () =>
      draft && preview.plan
        ? checkAiPlan(preview.plan, draft.facts, rules)
        : [],
    [draft, preview.plan, rules],
  );
  const mutation = useMutation({
    mutationFn: async (plan: SEOPlanData) => {
      const options = {
        startDate,
        athleteId: Number(athleteId),
        timeZone,
        replacePlanId: replacePlanId ? Number(replacePlanId) : undefined,
        ...(draft ? { status: 'DRAFT' as const } : {}),
        ...(draft?.goalEventId ? { goalEventId: draft.goalEventId } : {}),
      };
      return planToken
        ? SeoPlanAPI.importPlan({ ...options, planToken })
        : SeoPlanAPI.importJson({ ...options, planData: plan });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [cycleKeys.getMyCycles] });
      queryClient.invalidateQueries({ queryKey: [eventKeys.getMyEvents] });
      queryClient.invalidateQueries({ queryKey: ['managed-plans'] });
      queryClient.invalidateQueries({ queryKey: ['json-plans'] });
      toast.success(
        m.training_plan_imported_successfully({ planName: data.name }),
      );
      onImported?.(data);
      onClose();
    },
  });
  const error = mutation.error;
  const serverError = isAxiosError(error)
    ? error.response?.data?.message
    : error?.message;
  // Only a future plan can be replaced; for an AI draft, offer only those.
  const replaceable = (plans.data ?? []).filter(
    (plan) => !draft || new Date(plan.startDate).getTime() > Date.now(),
  );
  const selectedPlan = plans.data?.find(
    (plan) => String(plan.trainingPlanId) === replacePlanId,
  );
  // Replacing keeps the plan's races; those outside the new dates are
  // unlinked, as the import does, but stay in the calendar.
  const keptRaces = (selectedPlan?.races ?? []).map(
    ({ competition: { event } }) => event,
  );
  const unlinkedRaces = preview.schedule
    ? keptRaces.filter(
        (race) =>
          new Date(race.startDate) < preview.schedule!.startDate ||
          new Date(race.endDate) > preview.schedule!.endDate,
      )
    : [];
  const dateLabel = (date: Date | string) =>
    new Date(date).toLocaleDateString(getLocale(), { timeZone });
  // The example fills the box so the preview shows what it would create.
  const loadExample = () => {
    if (
      text.trim() &&
      text !== TRAINING_PLAN_EXAMPLE_TEXT &&
      !window.confirm(m.json_plan_example_replace())
    )
      return;
    setText(TRAINING_PLAN_EXAMPLE_TEXT);
    setFileError('');
    setConfirmed(false);
  };
  const downloadExample = () => {
    const url = URL.createObjectURL(
      new Blob([TRAINING_PLAN_EXAMPLE_TEXT], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = TRAINING_PLAN_EXAMPLE_FILE;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => !value && !mutation.isPending && onClose()}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft ? m.ai_plan_review_title() : m.json_plan_import()}
          </DialogTitle>
          <DialogDescription>
            {draft ? m.ai_plan_review_help() : m.json_plan_review_help()}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4">
          {!planToken && !draft && (
            <section
              aria-label={m.json_plan_example_title()}
              className="space-y-2 rounded-md border bg-muted/30 p-3"
            >
              <p className="text-sm font-medium">
                {m.json_plan_example_title()}
              </p>
              <p className="text-sm text-muted-foreground">
                {m.json_plan_example_help()}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadExample}
                >
                  {m.json_plan_example_load()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadExample}
                >
                  {m.json_plan_example_download()}
                </Button>
              </div>
              <details>
                <summary className="cursor-pointer text-sm">
                  {m.json_plan_format_title()}
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  <li>{m.json_plan_format_plan()}</li>
                  <li>{m.json_plan_format_cycles()}</li>
                  <li>{m.json_plan_format_sessions()}</li>
                  <li>{m.json_plan_format_steps()}</li>
                  <li>{m.json_plan_format_targets()}</li>
                  <li>{m.json_plan_format_limits()}</li>
                </ul>
              </details>
            </section>
          )}
          {!planToken && !draft && (
            <label className="block space-y-2">
              {m.json_plan_file()}
              <Input
                type="file"
                accept=".json,application/json"
                onChange={async (event) => {
                  setText('');
                  setFileError('');
                  setConfirmed(false);
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 90000) {
                    setFileError(m.json_plan_file_limit());
                    return;
                  }
                  try {
                    setText(await file.text());
                  } catch {
                    setFileError(m.json_plan_invalid());
                  }
                }}
              />
            </label>
          )}
          {temporary.isLoading && <p>{m.loading()}</p>}
          {temporary.isError && (
            <p role="alert">{m.failed_to_import_training_plan()}</p>
          )}
          <label className="block space-y-2">
            {m.json_plan_content()}
            <textarea
              aria-label={m.json_plan_content()}
              readOnly={!!planToken || structuring}
              className="w-full h-36 border rounded p-2 font-mono text-xs"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setFileError('');
                setConfirmed(false);
              }}
            />
          </label>
          {(preview.error || fileError) && (
            <pre
              role="alert"
              className="whitespace-pre-wrap text-sm text-destructive"
            >
              {fileError || preview.error}
            </pre>
          )}
          {draft && preview.plan && (
            <>
              <AiPlanChecks issues={issues} conflicts={draft.conflicts} />
              {rules && (
                <AiPlanRulesEditor
                  rules={rules}
                  notes={ruleNotes}
                  onChange={(next, notes) => {
                    setRules(next);
                    setRuleNotes(notes);
                    setConfirmed(false);
                  }}
                />
              )}
              <AiPlanSteps
                plan={preview.plan}
                athleteId={draft.athleteId}
                onPlan={(plan) => setText(JSON.stringify(plan, null, 2))}
                onRunningChange={setStructuring}
              />
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              {m.athlete()}
              <select
                aria-label={m.athlete()}
                className="block w-full border rounded p-2"
                disabled={!!draft}
                value={athleteId}
                onChange={(event) => {
                  setAthleteId(event.target.value);
                  setReplacePlanId('');
                  setConfirmed(false);
                }}
              >
                <option value="">{m.json_plan_choose_athlete()}</option>
                {athletes.map(
                  (athlete) =>
                    athlete && (
                      <option key={athlete.athleteId} value={athlete.athleteId}>
                        {athlete.user
                          ? `${athlete.user.firstName} ${athlete.user.lastName}`
                          : `${m.athlete()} ${athlete.athleteId}`}
                      </option>
                    ),
                )}
              </select>
            </label>
            <label>
              {m.training_plan_start_date()}
              <Input
                aria-label={m.training_plan_start_date()}
                type="date"
                disabled={!!draft}
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            {m.json_plan_schedule_help({ timeZone })}
          </p>
          {athleteId && (
            <label className="block">
              {m.json_plan_destination()}
              <select
                aria-label={m.json_plan_destination()}
                className="block w-full border rounded p-2"
                value={replacePlanId}
                onChange={(event) => {
                  setReplacePlanId(event.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">{m.json_plan_new()}</option>
                {replaceable.map((plan) => (
                  <option key={plan.trainingPlanId} value={plan.trainingPlanId}>
                    {plan.name} · {dateLabel(plan.startDate)} –{' '}
                    {dateLabel(plan.endDate)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selectedPlan && (
            <div className="space-y-1 text-sm" role="status">
              <p>{m.json_plan_replace_warning({ name: selectedPlan.name })}</p>
              {keptRaces.length > 0 && (
                <p>
                  {m.json_plan_races_kept({
                    races: keptRaces.map((race) => race.name).join(', '),
                  })}
                </p>
              )}
              {unlinkedRaces.map((race) => (
                <p
                  key={race.eventId}
                  className="text-amber-700 dark:text-amber-400"
                >
                  {m.json_plan_race_unlinked({ name: race.name })}
                </p>
              ))}
            </div>
          )}
          {preview.plan && preview.schedule && (
            <section aria-label={m.json_plan_preview()} className="space-y-3">
              <h3 className="font-semibold">{preview.plan.plan.name}</h3>
              <p className="whitespace-pre-wrap">
                {preview.plan.plan.description}
              </p>
              <p>{preview.plan.plan.goal}</p>
              <p className="text-sm text-muted-foreground">
                {m.json_plan_metadata_help()}
              </p>
              {preview.schedule.cycles.map((cycle, ci) => (
                <div key={ci} className="border rounded p-3 space-y-2">
                  <h4 className="font-semibold">{cycle.name}</h4>
                  <p>{cycle.description}</p>
                  {cycle.weeks.map((week, wi) => (
                    <div key={wi} className="space-y-2">
                      <h5 className="font-medium">
                        {dateLabel(week.startDate)} – {dateLabel(week.endDate)}{' '}
                        · {week.theme}
                      </h5>
                      <p className="text-sm">
                        {m.json_plan_totals({
                          minutes: String(
                            Math.round(
                              week.sessions.reduce(
                                (sum, session) =>
                                  sum + (session.goalDuration ?? 3600),
                                0,
                              ) / 60,
                            ),
                          ),
                          distance: String(
                            week.sessions.reduce(
                              (sum, session) =>
                                sum + (session.goalDistance ?? 0),
                              0,
                            ) / 1000,
                          ),
                          elevation: String(
                            week.sessions.reduce(
                              (sum, session) =>
                                sum + (session.goalElevationGain ?? 0),
                              0,
                            ),
                          ),
                        })}
                      </p>
                      {week.sessions.map((session, si) => (
                        <article
                          key={si}
                          className="border-l-2 pl-3 text-sm space-y-1"
                        >
                          <p className="font-medium">
                            {dateLabel(session.startDate)} · {session.name} ·{' '}
                            {sportTypeLabelMap[session.sport]}
                          </p>
                          <p>
                            {Math.round((session.goalDuration ?? 3600) / 60)}{' '}
                            min ·{' '}
                            {session.goalDistance == null
                              ? '—'
                              : session.goalDistance / 1000}{' '}
                            km · D+ {session.goalElevationGain ?? '—'} m · RPE{' '}
                            {session.goalRpe ?? '—'}/10
                          </p>
                          <p className="whitespace-pre-wrap">
                            {session.description}
                          </p>
                          {session.workout && (
                            <details>
                              <summary>{m.json_plan_steps()}</summary>
                              <pre className="whitespace-pre-wrap break-words">
                                {JSON.stringify(session.workout, null, 2)}
                              </pre>
                            </details>
                          )}
                        </article>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </section>
          )}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {m.json_plan_confirm()}
          </label>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {m.failed_to_import_training_plan()}{' '}
              {typeof serverError === 'string'
                ? serverError
                : JSON.stringify(serverError)}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              {m.cancel()}
            </Button>
            <Button
              disabled={
                !preview.plan ||
                !athleteId ||
                !confirmed ||
                !!fileError ||
                temporary.isError ||
                mutation.isPending ||
                issues.length > 0 ||
                structuring
              }
              isLoading={mutation.isPending}
              onClick={() => preview.plan && mutation.mutate(preview.plan)}
            >
              {m.json_plan_publish()}
            </Button>
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
