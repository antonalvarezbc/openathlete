import {
  useGetMyAthleteQuery,
  useGetMyCoachedAthletesQuery,
} from '@/api/athlete';
import { cycleKeys } from '@/api/cycle/cycle.keys';
import { eventKeys } from '@/api/event/event.keys';
import {
  AdaptationContextResponse,
  AdaptationProposalResponse,
  PlanAdaptationAPI,
} from '@/api/plan-adaptation/plan-adaptation.api';
import { SeoPlanAPI } from '@/api/seo-plan';
import { trainingLoadKeys } from '@/api/training-load/training-load.keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { WorkoutSummary } from '@/components/workout/workout-summary';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  AdaptationSession,
  PlanAdaptationRequest,
  RefinePlanAdaptation,
  planAdaptationProposalSchema,
  planAdaptationRequestSchema,
} from '@openathlete/shared';

import { SettingsSection } from './settings-section';

function monday() {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function StructuredPreview({
  workout,
}: {
  workout: NonNullable<AdaptationSession['workout']>;
}) {
  // This shared summary resolves relative targets against the signed-in athlete.
  // Keep those targets in the JSON comparison instead of showing coach-derived values.
  const targets = workout.steps.flatMap((step) => [
    ...step.targets,
    ...(step.repeatBlock?.childSteps.flatMap((child) => child.targets) ?? []),
  ]);
  if (
    targets.some(
      (target) => target.metricType != null || target.targetType === 'ZONE',
    )
  )
    return null;
  return (
    <WorkoutSummary
      workout={{
        eventTrainingId: 0,
        steps: workout.steps.map((step, orderIndex) => ({
          ...step,
          orderIndex,
          repeatBlock: step.repeatBlock
            ? {
                ...step.repeatBlock,
                childSteps: step.repeatBlock.childSteps.map((child, index) => ({
                  ...child,
                  orderIndex: index,
                })),
              }
            : null,
        })),
      }}
    />
  );
}

export function PlanAdaptationSection() {
  const { data: own } = useGetMyAthleteQuery();
  const { data: coached = [] } = useGetMyCoachedAthletesQuery();
  const athletes = [own, ...coached].filter(
    (item, index, list) =>
      item && list.findIndex((a) => a?.athleteId === item.athleteId) === index,
  );
  const [request, setRequest] = useState<PlanAdaptationRequest>({
    language: getLocale(),
    allowRedistribution: false,
    allowNewSessions: false,
    maxNewSessions: 2,
    newSessionMinutes: 60,
    newSessionMaxRpe: 4,
    athleteId: 0,
    planId: 0,
    scope: 'NEXT_SESSION',
    weekStart: monday(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    readiness: 'UNKNOWN',
    currentState: '',
    instructions: '',
    allowIncrease: false,
    maxIncreasePercent: 10,
  });
  const [context, setContext] = useState<AdaptationContextResponse | null>(
    null,
  );
  const [proposalText, setProposalText] = useState('');
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [validationIssue, setValidationIssue] =
    useState<AdaptationProposalResponse['validationIssue']>(null);
  const [history, setHistory] = useState<RefinePlanAdaptation['history']>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const locale = getLocale();
  useEffect(() => {
    setRequest((previous) => ({ ...previous, language: locale }));
    setContext(null);
    setProposalText('');
    setRawResponse(null);
    setValidationIssue(null);
    setFeedback('');
    setHistory([]);
    setConfirmed(false);
  }, [locale]);
  const client = useQueryClient();
  const plans = useQuery({
    queryKey: ['json-plans', String(request.athleteId)],
    queryFn: () => SeoPlanAPI.listPlans(request.athleteId),
    enabled: !!request.athleteId,
  });
  const proposal = useMemo(() => {
    try {
      return planAdaptationProposalSchema.safeParse(JSON.parse(proposalText));
    } catch {
      return null;
    }
  }, [proposalText]);
  const updateRequest = (patch: Partial<PlanAdaptationRequest>) => {
    setRequest((previous) => ({ ...previous, ...patch }));
    setContext(null);
    setProposalText('');
    setRawResponse(null);
    setValidationIssue(null);
    setFeedback('');
    setHistory([]);
    setConfirmed(false);
    setError('');
  };
  const messages: Record<string, () => string> = {
    ADAPTATION_NO_SESSIONS: m.adaptation_no_sessions,
    ADAPTATION_MODEL_INVALID: m.adaptation_model_invalid,
    ADAPTATION_PROVIDER: m.adaptation_provider_failed,
    ADAPTATION_NO_WEEK: m.adaptation_no_week,
    ADAPTATION_NEW_PERMISSION: m.adaptation_new_permission,
    ADAPTATION_NEW_BUDGET: m.adaptation_new_budget_error,
    ADAPTATION_DATE: m.adaptation_date_error,
    ADAPTATION_OVERLAP: m.adaptation_overlap_error,
    ADAPTATION_REDISTRIBUTION: m.adaptation_redistribution_error,
    ADAPTATION_EXPORTED: m.adaptation_exported,
    ADAPTATION_INCREASE: m.adaptation_increase_error,
    ADAPTATION_INVALID: m.adaptation_invalid_error,
    ADAPTATION_STRUCTURE: m.adaptation_structure_error,
    ADAPTATION_TARGET: m.adaptation_target_error,
    ADAPTATION_DURATION: m.adaptation_duration_error,
    ADAPTATION_IDS: m.adaptation_ids_error,
    ADAPTATION_KEEP: m.adaptation_keep_error,
    ADAPTATION_REST: m.adaptation_rest_error,
    ADAPTATION_BASELINE: m.adaptation_baseline_error,
    ADAPTATION_EMPTY: m.adaptation_empty_error,
  };
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (error) {
      const code = isAxiosError(error) ? error.response?.data?.code : undefined;

      // Never expose untranslated server/provider errors in the interface.
      setError(
        messages[code]?.() ??
          (isAxiosError(error) && error.response?.status === 409
            ? m.adaptation_stale_error()
            : isAxiosError(error) && error.response?.status === 403
              ? m.adaptation_access_error()
              : isAxiosError(error) && error.response?.status === 400
                ? m.adaptation_invalid_error()
                : m.adaptation_failed()),
      );
    } finally {
      setBusy(false);
    }
  };
  const updateSession = (index: number, patch: Partial<AdaptationSession>) => {
    if (!proposal?.success) return;
    const data = structuredClone(proposal.data);
    const session = data.sessions[index];
    if (
      patch.goalDuration != null &&
      session.goalDuration > 0 &&
      session.workout
    ) {
      const ratio = patch.goalDuration / session.goalDuration;
      for (const step of session.workout.steps) {
        for (const child of step.repeatBlock?.childSteps ?? [step]) {
          if (child.durationType === 'TIME' && child.durationValue != null)
            child.durationValue = Math.floor(child.durationValue * ratio);
        }
      }
    }
    Object.assign(session, patch, { action: 'UPDATE' });
    setProposalText(JSON.stringify(data, null, 2));
    setValidationIssue(null);
    setConfirmed(false);
  };
  const metricText = (session: AdaptationSession) =>
    `${Math.round(session.goalDuration / 60)} min · ${session.goalDistance == null ? '—' : (session.goalDistance / 1000).toLocaleString(getLocale(), { maximumFractionDigits: 2 })} km · D+ ${session.goalElevationGain ?? '—'} m · RPE ${session.goalRpe ?? '—'}/10`;
  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5" aria-hidden="true" />
          {m.adaptation_title()}
        </span>
      }
      description={m.adaptation_help()}
      contentClassName="pt-6"
    >
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <p className="text-sm text-muted-foreground">
          {m.adaptation_permissions_help()}
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label>
            {m.athlete()}
            <select
              className="block w-full border rounded p-2"
              aria-label={m.athlete()}
              value={request.athleteId || ''}
              onChange={(event) =>
                updateRequest({
                  athleteId: Number(event.target.value),
                  planId: 0,
                })
              }
            >
              <option value="">{m.json_plan_choose_athlete()}</option>
              {athletes.map(
                (item) =>
                  item && (
                    <option key={item.athleteId} value={item.athleteId}>
                      {item.user
                        ? `${item.user.firstName} ${item.user.lastName}`
                        : `${m.athlete()} ${item.athleteId}`}
                    </option>
                  ),
              )}
            </select>
          </label>
          <label>
            {m.training_plan_settings()}
            <select
              className="block w-full border rounded p-2"
              aria-label={m.training_plan_settings()}
              value={request.planId || ''}
              onChange={(event) => {
                const planId = Number(event.target.value);
                const plan = plans.data?.find(
                  (item) => item.trainingPlanId === planId,
                );
                const start = plan ? new Date(plan.startDate) : new Date();
                const firstDay = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
                updateRequest({
                  planId,
                  weekStart: firstDay > monday() ? firstDay : monday(),
                });
              }}
            >
              <option value="">{m.adaptation_choose_plan()}</option>
              {plans.data?.map((plan) => (
                <option key={plan.trainingPlanId} value={plan.trainingPlanId}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {m.adaptation_scope()}
            <select
              className="block w-full border rounded p-2"
              aria-label={m.adaptation_scope()}
              value={request.scope}
              onChange={(event) =>
                updateRequest({
                  scope: event.target.value as PlanAdaptationRequest['scope'],
                  allowNewSessions: false,
                })
              }
            >
              <option value="NEXT_SESSION">{m.adaptation_next()}</option>
              <option value="WEEK">{m.adaptation_week()}</option>
            </select>
          </label>
          {request.scope === 'WEEK' && (
            <label>
              {m.adaptation_week_start()}
              <Input
                type="date"
                aria-label={m.adaptation_week_start()}
                value={request.weekStart}
                onChange={(event) =>
                  updateRequest({ weekStart: event.target.value })
                }
              />
            </label>
          )}
        </div>
        <label className="block">
          {m.adaptation_readiness()}
          <select
            className="block w-full border rounded p-2"
            aria-label={m.adaptation_readiness()}
            value={request.readiness}
            onChange={(event) =>
              updateRequest({
                readiness: event.target
                  .value as PlanAdaptationRequest['readiness'],
                allowIncrease: false,
                allowNewSessions: false,
              })
            }
          >
            <option value="UNKNOWN">{m.adaptation_unknown()}</option>
            <option value="READY">{m.adaptation_ready()}</option>
            <option value="TIRED">{m.adaptation_tired()}</option>
            <option value="ILL">{m.adaptation_ill()}</option>
            <option value="PAIN">{m.adaptation_pain()}</option>
          </select>
        </label>
        <label className="block">
          {m.adaptation_state()}
          <textarea
            className="w-full border rounded p-2 min-h-24"
            aria-label={m.adaptation_state()}
            maxLength={3000}
            value={request.currentState}
            onChange={(event) =>
              updateRequest({ currentState: event.target.value })
            }
          />
        </label>
        <label className="block">
          {m.adaptation_instructions()}
          <textarea
            className="w-full border rounded p-2"
            aria-label={m.adaptation_instructions()}
            maxLength={3000}
            value={request.instructions}
            onChange={(event) =>
              updateRequest({ instructions: event.target.value })
            }
          />
        </label>
        <label className="flex gap-2 items-start">
          <input
            type="checkbox"
            checked={request.allowNewSessions ?? false}
            disabled={request.readiness !== 'READY'}
            onChange={(event) =>
              updateRequest({
                allowNewSessions: event.target.checked,
                scope: 'WEEK',
              })
            }
          />
          {m.adaptation_add_sessions()}
        </label>
        <p className="text-sm text-muted-foreground">
          {m.adaptation_add_help()} {m.adaptation_minutes_ceiling_help()}
        </p>
        {request.allowNewSessions && (
          <div className="grid sm:grid-cols-3 gap-3">
            <label>
              {m.adaptation_new_count()}
              <Input
                type="number"
                min={1}
                max={7}
                value={request.maxNewSessions}
                onChange={(event) =>
                  updateRequest({ maxNewSessions: Number(event.target.value) })
                }
              />
            </label>
            <label>
              {m.adaptation_new_minutes()}
              <Input
                type="number"
                min={1}
                max={600}
                value={request.newSessionMinutes}
                onChange={(event) =>
                  updateRequest({
                    newSessionMinutes: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              {m.adaptation_new_rpe()}
              <Input
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={request.newSessionMaxRpe}
                onChange={(event) =>
                  updateRequest({
                    newSessionMaxRpe: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
        )}
        <label className="flex gap-2 items-start">
          <input
            type="checkbox"
            checked={request.allowRedistribution ?? false}
            onChange={(event) =>
              updateRequest({ allowRedistribution: event.target.checked })
            }
          />
          {m.adaptation_redistribute()}
        </label>
        <p className="text-sm text-muted-foreground">
          {m.adaptation_redistribute_help()}
        </p>
        <label className="flex gap-2 items-start">
          <input
            type="checkbox"
            checked={request.allowIncrease}
            disabled={request.readiness !== 'READY'}
            onChange={(event) =>
              updateRequest({ allowIncrease: event.target.checked })
            }
          />
          {m.adaptation_allow_increase()}
        </label>
        {request.allowIncrease && (
          <label className="block">
            {m.adaptation_limit()}
            <Input
              type="number"
              min={0}
              max={25}
              aria-label={m.adaptation_limit()}
              value={request.maxIncreasePercent}
              onChange={(event) =>
                updateRequest({
                  maxIncreasePercent: Number(event.target.value),
                })
              }
            />
          </label>
        )}
        <p className="text-sm text-muted-foreground">
          {m.adaptation_limit_help()}
        </p>
        <Button
          variant="outline"
          disabled={!planAdaptationRequestSchema.safeParse(request).success}
          onClick={() =>
            run(async () => {
              setContext(await PlanAdaptationAPI.context(request));
              setProposalText('');
              setRawResponse(null);
              setValidationIssue(null);
              setFeedback('');
              setHistory([]);
              setConfirmed(false);
            })
          }
        >
          {m.adaptation_context()}
        </Button>
        {context && (
          <div className="space-y-3">
            <p>{m.adaptation_context_help()}</p>
            <details>
              <summary>{m.adaptation_context_details()}</summary>
              <pre className="text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto">
                {JSON.stringify(context.data, null, 2)}
              </pre>
            </details>
            <ul>
              {context.data.sessions.map((item) => (
                <li key={item.original.eventId}>
                  {new Date(item.startDate).toLocaleString(getLocale())} ·{' '}
                  {item.original.name} · {metricText(item.original)}
                  {item.exported ? ` · ${m.adaptation_exported()}` : ''}
                  <p className="whitespace-pre-wrap">
                    {item.original.description}
                  </p>
                  {item.original.workout && (
                    <details>
                      <summary>{m.json_plan_steps()}</summary>
                      <StructuredPreview workout={item.original.workout} />
                      <pre className="text-xs whitespace-pre-wrap break-words">
                        {JSON.stringify(item.original.workout, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            <Button
              onClick={() =>
                run(async () => {
                  setProposalText('');
                  setRawResponse(null);
                  setValidationIssue(null);
                  setFeedback('');
                  setHistory([]);
                  setConfirmed(false);
                  const result = await PlanAdaptationAPI.propose(request);
                  setContext(result);
                  setValidationIssue(result.validationIssue);
                  setRawResponse(result.rawResponse ?? '');
                  setProposalText(
                    result.proposal
                      ? JSON.stringify(result.proposal, null, 2)
                      : '',
                  );
                })
              }
            >
              <SparklesIcon className="h-4 w-4" aria-hidden="true" />
              {m.adaptation_generate()}
            </Button>
          </div>
        )}
        {proposal?.success && context && (
          <section className="space-y-4" aria-label={m.adaptation_proposal()}>
            <h3 className="font-semibold">{m.adaptation_proposal()}</h3>
            {validationIssue && (
              <div
                role="alert"
                className="border border-destructive rounded p-3 text-destructive"
              >
                <p>
                  {validationIssue.sessionName
                    ? `${validationIssue.sessionName}: `
                    : ''}
                  {(
                    messages[validationIssue.code] ?? m.adaptation_invalid_error
                  )()}
                </p>
                <p>{m.adaptation_invalid_draft()}</p>
              </div>
            )}
            <p>{proposal.data.summary}</p>
            {proposal.data.warnings.map((warning, index) => (
              <p key={index} className="text-sm">
                {warning}
              </p>
            ))}
            {(proposal.data.newSessions ?? []).map((session, index) => (
              <div
                key={`new-${index}`}
                className="border rounded p-3 space-y-2"
              >
                <h4 className="font-semibold">
                  {m.adaptation_new_label()}: {session.name}
                </h4>
                <p>
                  {m.adaptation_date()}:{' '}
                  {new Date(session.startDate).toLocaleString(getLocale())}
                </p>
                <p>
                  {Math.round(session.goalDuration / 60)} min · RPE{' '}
                  {session.goalRpe}/10
                </p>
                <p>{session.reason}</p>
                <p className="whitespace-pre-wrap">{session.description}</p>
                <StructuredPreview workout={session.workout} />
                <Button
                  variant="outline"
                  onClick={() => {
                    const data = structuredClone(proposal.data);
                    data.newSessions?.splice(index, 1);
                    setProposalText(JSON.stringify(data, null, 2));
                    setValidationIssue(null);
                    setConfirmed(false);
                  }}
                >
                  {m.adaptation_remove_new()}
                </Button>
              </div>
            ))}
            {proposal.data.sessions.map((session, index) => {
              const original = context.data.sessions.find(
                (item) => item.original.eventId === session.eventId,
              )?.original;
              return (
                <div
                  key={session.eventId}
                  className="border rounded p-3 space-y-3"
                >
                  <h4 className="font-semibold">{session.name}</h4>
                  <p>
                    {m.adaptation_before()}:{' '}
                    {original ? metricText(original) : '—'}
                    {original?.startDate &&
                      ` · ${new Date(original.startDate).toLocaleString(getLocale())}`}
                  </p>
                  <p>
                    {m.adaptation_after()}:{' '}
                    {session.action === 'REST'
                      ? m.adaptation_rest()
                      : metricText(session)}
                  </p>
                  <p>
                    {m.adaptation_date()}:{' '}
                    {new Date(
                      session.startDate ?? original?.startDate ?? '',
                    ).toLocaleString(getLocale())}
                  </p>
                  <p>{session.reason}</p>
                  <p className="whitespace-pre-wrap">{session.description}</p>
                  {session.action !== 'REST' && (
                    <div className="grid sm:grid-cols-2 gap-2">
                      <label>
                        {m.adaptation_minutes()}
                        <Input
                          type="number"
                          min={1}
                          value={session.goalDuration / 60}
                          onChange={(event) =>
                            updateSession(index, {
                              goalDuration: Math.round(
                                Number(event.target.value) * 60,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        RPE /10
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={session.goalRpe ?? ''}
                          onChange={(event) =>
                            updateSession(index, {
                              goalRpe:
                                event.target.value === ''
                                  ? null
                                  : Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                  {session.workout && (
                    <StructuredPreview workout={session.workout} />
                  )}
                  <details>
                    <summary>{m.json_plan_steps()}</summary>
                    <pre className="text-xs whitespace-pre-wrap break-words">
                      {JSON.stringify(
                        {
                          original: original?.workout,
                          proposed: session.workout,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </div>
              );
            })}
          </section>
        )}
        {rawResponse !== null && !proposal?.success && (
          <section
            className="space-y-3 border rounded p-4"
            aria-label={m.adaptation_raw_title()}
          >
            <h3 className="font-semibold">{m.adaptation_raw_title()}</h3>
            <p role="alert">{m.adaptation_raw_help()}</p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">
              {rawResponse || m.adaptation_raw_missing()}
            </pre>
            <Button
              variant="outline"
              onClick={() => {
                setRawResponse(null);
                setProposalText('');
                setHistory([]);
                setFeedback('');
                setConfirmed(false);
              }}
            >
              {m.adaptation_reject()}
            </Button>
          </section>
        )}
        {(proposal?.success || rawResponse !== null) && context && (
          <section className="space-y-3" aria-label={m.adaptation_discuss()}>
            <h3 className="font-semibold">{m.adaptation_discuss()}</h3>
            <p className="text-sm text-muted-foreground">
              {m.adaptation_discuss_help()}
            </p>
            {history.length > 0 && (
              <details>
                <summary>{m.adaptation_discuss_history()}</summary>
                {history.map((turn, index) => (
                  <div key={index} className="border rounded p-3 my-2">
                    <p className="whitespace-pre-wrap">
                      {m.adaptation_coach_message()}: {turn.feedback}
                    </p>
                    <p className="whitespace-pre-wrap">IA: {turn.summary}</p>
                  </div>
                ))}
              </details>
            )}
            <textarea
              aria-label={m.adaptation_feedback()}
              placeholder={m.adaptation_feedback()}
              className="w-full border rounded p-2 min-h-24"
              maxLength={3000}
              value={feedback}
              onChange={(event) => {
                setFeedback(event.target.value);
                setConfirmed(false);
              }}
            />
            <Button
              disabled={!feedback.trim()}
              onClick={() =>
                run(async () => {
                  setConfirmed(false);
                  const result = await PlanAdaptationAPI.refine({
                    request,
                    contextVersion: context.contextVersion,
                    proposal: proposal?.success ? proposal.data : null,
                    rawResponse: proposal?.success
                      ? undefined
                      : (proposalText || rawResponse || '').slice(0, 100000),
                    feedback,
                    history,
                  });
                  setContext(result);
                  setValidationIssue(result.validationIssue);
                  setRawResponse(result.rawResponse ?? '');
                  setProposalText(
                    result.proposal
                      ? JSON.stringify(result.proposal, null, 2)
                      : '',
                  );
                  setHistory((previous) =>
                    [
                      ...previous,
                      {
                        feedback,
                        summary: (
                          result.proposal?.summary ??
                          result.rawResponse ??
                          m.adaptation_raw_missing()
                        ).slice(0, 4000),
                      },
                    ].slice(-10),
                  );
                  setFeedback('');
                })
              }
            >
              <SparklesIcon className="h-4 w-4" aria-hidden="true" />
              {m.adaptation_refine()}
            </Button>
          </section>
        )}
        {proposalText && (
          <div className="space-y-3">
            <details>
              <summary>{m.adaptation_edit_json()}</summary>
              <textarea
                aria-label={m.adaptation_edit_json()}
                className="w-full h-64 border rounded p-2 font-mono text-xs"
                value={proposalText}
                onChange={(event) => {
                  setProposalText(event.target.value);
                  setValidationIssue(null);
                  setConfirmed(false);
                }}
              />
            </details>
            {!proposal?.success && <p role="alert">{m.json_plan_invalid()}</p>}
            <label className="flex gap-2 items-start">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {m.adaptation_confirm()}
            </label>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setProposalText('');
                  setRawResponse(null);
                  setValidationIssue(null);
                  setFeedback('');
                  setHistory([]);
                  setConfirmed(false);
                }}
              >
                {m.adaptation_reject()}
              </Button>
              <Button
                disabled={
                  !proposal?.success ||
                  !!validationIssue ||
                  !confirmed ||
                  !(
                    proposal.data.sessions.length +
                    (proposal.data.newSessions?.length ?? 0)
                  )
                }
                onClick={() =>
                  run(async () => {
                    if (!proposal?.success || !context) return;
                    await PlanAdaptationAPI.apply({
                      request,
                      contextVersion: context.contextVersion,
                      proposal: proposal.data,
                      confirmed: true,
                    });
                    await Promise.all([
                      client.invalidateQueries({
                        queryKey: [eventKeys.getMyEvents],
                      }),
                      client.invalidateQueries({
                        queryKey: [eventKeys.getEvent],
                      }),
                      client.invalidateQueries({
                        queryKey: [cycleKeys.getMyCycles],
                      }),
                      client.invalidateQueries({
                        queryKey: [trainingLoadKeys.getWeeklyLoadSummary],
                      }),
                    ]);
                    setProposalText('');
                    setRawResponse(null);
                    setValidationIssue(null);
                    setFeedback('');
                    setHistory([]);
                    setContext(null);
                    setConfirmed(false);
                    toast.success(m.adaptation_applied());
                  })
                }
              >
                {m.adaptation_accept()}
              </Button>
            </div>
          </div>
        )}
        {busy && <p role="status">{m.loading()}</p>}
        {error && (
          <p role="alert" className="text-destructive whitespace-pre-wrap">
            {error}
          </p>
        )}
      </fieldset>
    </SettingsSection>
  );
}
