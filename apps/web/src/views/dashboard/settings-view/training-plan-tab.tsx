import { useAiTaskAvailable } from '@/api/ai-settings';
import {
  useGetMyAthleteQuery,
  useGetMyCoachedAthletesQuery,
} from '@/api/athlete';
import {
  ManagedPlan,
  PlanWorkspaceAPI,
} from '@/api/plan-workspace/plan-workspace.api';
import { AiPlanDialog } from '@/components/ai-plan/ai-plan-dialog';
import { AiSetupDialog } from '@/components/ai-settings';
import { CoachAssistant } from '@/components/coach-assistant/coach-assistant';
import { AthleteInjuries } from '@/components/plan-workspace/athlete-injuries';
import { CalendarWeeks } from '@/components/plan-workspace/calendar-weeks';
import {
  Field,
  displayDate,
  selectClass,
} from '@/components/plan-workspace/helpers';
import { PlanEditor } from '@/components/plan-workspace/plan-editor';
import { PlanRaces } from '@/components/plan-workspace/plan-races';
import { PlanWeeks } from '@/components/plan-workspace/plan-weeks';
import {
  PlanChoice,
  defaultPlanChoice,
  parsePlanChoice,
} from '@/components/plan-workspace/planning-selection';
import { Button } from '@/components/ui/button';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserRoles } from '@/contexts/auth';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AiTask } from '@openathlete/shared';

import { PlanAdaptationSection } from './plan-adaptation-section';

export function TrainingPlanTab() {
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') === 'assistant' ? 'assistant' : 'plan';
  const [adaptOpen, setAdaptOpen] = useState(false);
  const roles = useUserRoles();
  const { data: own } = useGetMyAthleteQuery();
  const { data: coached = [], isError: athletesError } =
    useGetMyCoachedAthletesQuery();
  const athletes = [
    ...(roles?.includes('ATHLETE') && own ? [own] : []),
    ...coached,
  ].filter(
    (a, i, all) => all.findIndex((b) => b.athleteId === a.athleteId) === i,
  );
  const athleteId = Number(params.get('athleteId')) || 0;
  // Absent until chosen, by the coach or by the default below.
  const choice = parsePlanChoice(params.get('planId'));
  const [editor, setEditor] = useState<ManagedPlan | 'new' | null>(null);
  const [aiPlanOpen, setAiPlanOpen] = useState(false);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
  const aiPlans = useAiTaskAvailable(AiTask.PLAN_GENERATION);
  const client = useQueryClient();
  const plans = useQuery({
    queryKey: ['managed-plans', athleteId],
    queryFn: () => PlanWorkspaceAPI.list(athleteId),
    enabled: athleteId > 0,
  });
  const plan = plans.data?.find((p) => p.trainingPlanId === choice);
  // A plan that no longer exists falls back to the calendar.
  const calendarMode = !!athleteId && !!plans.data && choice !== null && !plan;
  const editable = plan && ['DRAFT', 'ACTIVE'].includes(plan.status);
  const calendarPath =
    athleteId === own?.athleteId
      ? '/dashboard/calendar'
      : `/dashboard/calendar/${athleteId}`;
  const change = (athlete: number, next?: PlanChoice) => {
    setEditor(null);
    setParams((previous) => {
      previous.set('athleteId', String(athlete));
      if (next !== undefined) previous.set('planId', String(next));
      else previous.delete('planId');
      return previous;
    });
  };
  // Opening an athlete needs no plan choice: their active plan, else the
  // calendar. A choice the coach made is kept.
  useEffect(() => {
    if (!athleteId || choice !== null || !plans.data) return;
    const next = defaultPlanChoice(plans.data);
    setParams(
      (previous) => {
        previous.set('planId', String(next));
        return previous;
      },
      { replace: true },
    );
  }, [athleteId, choice, plans.data, setParams]);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['managed-plans', athleteId] }),
      client.invalidateQueries({ queryKey: ['plan-competitions'] }),
      client.invalidateQueries({ queryKey: ['json-plans'] }),
    ]);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {m.training_plan_settings()}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {m.workspace_intro()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!athleteId}
            onClick={() =>
              // Without AI for plans, say where to set it up first.
              !aiPlans.isLoading && !aiPlans.available
                ? setAiSetupOpen(true)
                : setAiPlanOpen(true)
            }
          >
            <SparklesIcon className="size-4" />
            {m.ai_plan_create()}
          </Button>
          <Button disabled={!athleteId} onClick={() => setEditor('new')}>
            <Plus className="size-4" />
            {m.workspace_new_plan()}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 sm:p-6">
        <Field label={m.athlete()}>
          <select
            className={selectClass}
            value={athleteId || ''}
            onChange={(e) => change(Number(e.target.value))}
          >
            <option value="">{m.json_plan_choose_athlete()}</option>
            {athletes.map((a) => (
              <option key={a.athleteId} value={a.athleteId}>
                {a.user
                  ? `${a.user.firstName} ${a.user.lastName}`
                  : `${m.athlete()} ${a.athleteId}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label={m.training_plan_settings()}>
          <select
            className={selectClass}
            name="plan"
            disabled={!athleteId || plans.isLoading}
            value={plan?.trainingPlanId ?? 'calendar'}
            onChange={(e) =>
              change(athleteId, parsePlanChoice(e.target.value) ?? 'calendar')
            }
          >
            <option value="calendar">{m.workspace_calendar_option()}</option>
            {plans.data?.map((p) => (
              <option key={p.trainingPlanId} value={p.trainingPlanId}>
                {p.name} · {displayDate(p.startDate)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {(plans.isError || athletesError) && (
        <p role="alert" className="text-destructive">
          {m.workspace_failed()}
        </p>
      )}
      {!!athleteId && plans.isLoading && <p>{m.loading()}</p>}
      {!!athleteId && plans.data?.length === 0 && (
        <p className="text-muted-foreground">{m.workspace_no_plans()}</p>
      )}
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setParams((previous) => {
            previous.set('tab', value);
            return previous;
          })
        }
      >
        <TabsList
          className="h-auto min-h-11 w-full sm:w-fit"
          aria-label={m.coach_planning()}
        >
          <TabsTrigger value="plan" className="min-h-10">
            {m.training_plan_settings()}
          </TabsTrigger>
          <TabsTrigger value="assistant" className="min-h-10">
            <SparklesIcon className="size-4" />
            {m.assistant_title()}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="plan" className="space-y-6 pt-4">
          {calendarMode && (
            <section
              className="space-y-4 rounded-xl border p-4 sm:p-6"
              data-planning-calendar
            >
              <div>
                <h3 className="text-lg font-semibold">
                  {m.workspace_calendar_option()}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {m.workspace_calendar_mode_help()}
                </p>
              </div>
              <CalendarWeeks
                athleteId={athleteId}
                calendarPath={calendarPath}
              />
            </section>
          )}
          {plan && (
            <>
              <section className="space-y-4 rounded-xl border p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold break-words">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {displayDate(plan.startDate)} –{' '}
                      {displayDate(plan.endDate)} ·{' '}
                      {
                        {
                          DRAFT: m.workspace_draft(),
                          ACTIVE: m.workspace_active(),
                          COMPLETED: m.workspace_completed(),
                          ARCHIVED: m.workspace_archived(),
                        }[plan.status]
                      }
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setEditor(plan)}>
                    {m.workspace_edit_plan()}
                  </Button>
                </div>
                <p className="whitespace-pre-wrap break-words">{plan.goal}</p>
                {plan.description && (
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                )}
                {editable && (
                  <Button asChild>
                    <Link
                      to={`${calendarPath}?trainingPlanId=${plan.trainingPlanId}&date=${encodeURIComponent(plan.startDate)}`}
                    >
                      <Calendar className="size-4" />
                      {m.workspace_plan_sessions()}
                    </Link>
                  </Button>
                )}
                <PlanWeeks
                  plan={plan}
                  editable={!!editable}
                  calendarPath={calendarPath}
                />
              </section>
              <PlanRaces
                key={plan.trainingPlanId}
                plan={plan}
                onChanged={refresh}
              />
            </>
          )}
          {!!athleteId && (
            <AthleteInjuries key={athleteId} athleteId={athleteId} />
          )}
          {(plan || calendarMode) && (
            <details
              id="plan-adaptation"
              className="rounded-xl border p-4 sm:p-6"
              open={adaptOpen}
              onToggle={(e) => setAdaptOpen(e.currentTarget.open)}
            >
              <summary className="cursor-pointer font-semibold">
                {m.workspace_adapt()}
              </summary>
              <div className="mt-4">
                <PlanAdaptationSection
                  key={`${athleteId}-${plan?.trainingPlanId ?? 'calendar'}`}
                  selection={{
                    athleteId,
                    planId: plan?.trainingPlanId,
                    startDate: plan?.startDate ?? new Date().toISOString(),
                  }}
                />
              </div>
            </details>
          )}
          <section className="rounded-xl border p-4 sm:p-6 space-y-3">
            <h3 className="font-semibold">{m.json_plan_import()}</h3>
            <p className="text-sm text-muted-foreground">
              {m.json_plan_review_help()}
            </p>
            <Button
              variant="outline"
              onClick={() =>
                setParams((previous) => {
                  previous.set('importPlan', 'json');
                  return previous;
                })
              }
            >
              {m.json_plan_import()}
            </Button>
          </section>
        </TabsContent>
        <TabsContent value="assistant" className="pt-4">
          {plan || calendarMode ? (
            <CoachAssistant
              key={`${athleteId}-${plan?.trainingPlanId ?? 'calendar'}-${getLocale()}`}
              athleteId={athleteId}
              planId={plan?.trainingPlanId}
              onAdapt={() => {
                setAdaptOpen(true);
                setParams((previous) => {
                  previous.set('tab', 'plan');
                  return previous;
                });
                requestAnimationFrame(() =>
                  document
                    .getElementById('plan-adaptation')
                    ?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
                );
              }}
            />
          ) : (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              {m.assistant_choose_plan()}
            </p>
          )}
        </TabsContent>
      </Tabs>
      <AiSetupDialog
        open={aiSetupOpen}
        onOpenChange={setAiSetupOpen}
        analyticsSource="ai_plan"
      />
      {aiPlanOpen && !!athleteId && (
        <AiPlanDialog
          key={athleteId}
          athleteId={athleteId}
          onClose={() => setAiPlanOpen(false)}
          onImported={(saved) => {
            change(athleteId, saved.trainingPlanId);
            void refresh();
          }}
        />
      )}
      {editor && !!athleteId && (
        <PlanEditor
          key={editor === 'new' ? 'new' : editor.trainingPlanId}
          athleteId={athleteId}
          plan={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            change(athleteId, saved.trainingPlanId);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
