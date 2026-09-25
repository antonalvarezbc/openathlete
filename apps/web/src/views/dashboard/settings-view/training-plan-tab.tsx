import {
  useGetMyAthleteQuery,
  useGetMyCoachedAthletesQuery,
} from '@/api/athlete';
import {
  ManagedPlan,
  PlanWorkspaceAPI,
} from '@/api/plan-workspace/plan-workspace.api';
import { AthleteInjuries } from '@/components/plan-workspace/athlete-injuries';
import {
  Field,
  displayDate,
  selectClass,
} from '@/components/plan-workspace/helpers';
import { PlanEditor } from '@/components/plan-workspace/plan-editor';
import { PlanRaces } from '@/components/plan-workspace/plan-races';
import { Button } from '@/components/ui/button';
import { useUserRoles } from '@/contexts/auth';
import { m } from '@/paraglide/messages';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { PlanAdaptationSection } from './plan-adaptation-section';

export function TrainingPlanTab() {
  const [params, setParams] = useSearchParams();
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
  const planId = Number(params.get('planId')) || 0;
  const [editor, setEditor] = useState<ManagedPlan | 'new' | null>(null);
  const client = useQueryClient();
  const plans = useQuery({
    queryKey: ['managed-plans', athleteId],
    queryFn: () => PlanWorkspaceAPI.list(athleteId),
    enabled: athleteId > 0,
  });
  const plan = plans.data?.find((p) => p.trainingPlanId === planId);
  const editable = plan && ['DRAFT', 'ACTIVE'].includes(plan.status);
  const calendarPath =
    athleteId === own?.athleteId
      ? '/dashboard/calendar'
      : `/dashboard/calendar/${athleteId}`;
  const change = (athlete: number, id = 0) => {
    setEditor(null);
    setParams((previous) => {
      previous.set('athleteId', String(athlete));
      if (id) previous.set('planId', String(id));
      else previous.delete('planId');
      return previous;
    });
  };
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
        <Button disabled={!athleteId} onClick={() => setEditor('new')}>
          <Plus className="size-4" />
          {m.workspace_new_plan()}
        </Button>
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
            disabled={!athleteId || plans.isLoading}
            value={plan?.trainingPlanId ?? ''}
            onChange={(e) => change(athleteId, Number(e.target.value))}
          >
            <option value="">{m.adaptation_choose_plan()}</option>
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
      {plan && (
        <>
          <section className="space-y-4 rounded-xl border p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold break-words">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {displayDate(plan.startDate)} – {displayDate(plan.endDate)} ·{' '}
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
            <details>
              <summary className="cursor-pointer py-2 font-medium">
                {m.workspace_weeks()}
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {plan.cycles.flatMap((cycle) =>
                  cycle.weeks.map((week) => (
                    <Link
                      key={week.trainingWeekId}
                      className="rounded-lg border p-3 text-sm hover:bg-muted"
                      to={`${calendarPath}?trainingPlanId=${plan.trainingPlanId}&date=${encodeURIComponent(week.startDate)}`}
                    >
                      <p className="font-medium">
                        {cycle.name} · {m.week()} {week.weekNumber}
                      </p>
                      <p>
                        {displayDate(week.startDate)} –{' '}
                        {displayDate(week.endDate)}
                      </p>
                      <p className="text-muted-foreground">
                        {week._count.sessions} {m.events()}
                      </p>
                    </Link>
                  )),
                )}
              </div>
            </details>
          </section>
          <PlanRaces
            key={plan.trainingPlanId}
            plan={plan}
            onChanged={refresh}
          />
        </>
      )}
      {!!athleteId && <AthleteInjuries key={athleteId} athleteId={athleteId} />}
      {plan && (
        <details className="rounded-xl border p-4 sm:p-6">
          <summary className="cursor-pointer font-semibold">
            {m.workspace_adapt()}
          </summary>
          <div className="mt-4">
            <PlanAdaptationSection
              key={`${athleteId}-${plan.trainingPlanId}`}
              selection={{
                athleteId,
                planId: plan.trainingPlanId,
                startDate: plan.startDate,
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
