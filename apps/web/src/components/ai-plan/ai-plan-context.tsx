import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { trainingZoneTypeLabelMap } from '@/utils/label-map/core';
import { metricTypeLabelMap } from '@/utils/label-map/core/metric-type.label-map';
import { ReactNode } from 'react';

import {
  AiPlanContextPreview,
  METRIC_TYPE,
  TRAINING_ZONE_TYPE,
} from '@openathlete/shared';

import { PlanningEvidenceSummary } from './planning-evidence';

const injuryStatus: Record<string, () => string> = {
  WORSENING: m.injury_status_worsening,
  IMPROVING: m.injury_status_improving,
  STABLE: m.injury_status_stable,
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="font-medium">{label}</dt>
      <dd className="min-w-0 break-words text-muted-foreground">{children}</dd>
    </div>
  );
}

/**
 * A compact summary of what the AI receives about the athlete for these
 * dates, from the same context the draft is built with.
 */
export function AiPlanContextSummary({
  context,
  isLoading,
}: {
  /** Undefined until the dates are valid */
  context?: AiPlanContextPreview;
  isLoading: boolean;
}) {
  const date = (value: string) =>
    new Date(value).toLocaleDateString(getLocale());
  const none = m.ai_plan_context_none();
  const athlete = context?.athlete;
  const sessions = athlete?.weeklyHistoryNewestFirst
    .slice(0, 4)
    .reduce((sum, week) => sum + week.sessions, 0);
  return (
    <section
      aria-label={m.ai_plan_context()}
      aria-busy={isLoading}
      className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm"
    >
      <h3 className="font-semibold">{m.ai_plan_context()}</h3>
      {!athlete ? (
        <p className="text-muted-foreground">
          {isLoading ? m.loading() : m.ai_plan_context_dates()}
        </p>
      ) : (
        <dl className="space-y-2">
          <Row label={m.ai_plan_context_training()}>
            {athlete.recentWeeklyMinutes != null
              ? m.ai_plan_context_training_value({
                  hours: (athlete.recentWeeklyMinutes / 60).toLocaleString(
                    getLocale(),
                    { maximumFractionDigits: 1 },
                  ),
                  sessions: String(sessions),
                })
              : m.ai_plan_context_training_none()}
          </Row>
          <Row label={m.ai_plan_context_metrics()}>
            {Object.entries(athlete.metrics)
              .map(
                ([type, value]) =>
                  `${metricTypeLabelMap[type as METRIC_TYPE] ?? type} ${value}`,
              )
              .join(' · ') || none}
          </Row>
          <Row label={m.ai_plan_context_zones()}>
            {context.zoneTypes
              .map(
                (type) =>
                  trainingZoneTypeLabelMap[type as TRAINING_ZONE_TYPE] ?? type,
              )
              .join(' · ') || none}
          </Row>
          <Row label={m.ai_plan_context_injuries()}>
            {athlete.injuries.length
              ? athlete.injuries
                  .map(
                    (injury) =>
                      `${injury.location} (${injuryStatus[injury.status]?.() ?? injury.status}, ${injury.painScore}/10)`,
                  )
                  .join(' · ')
              : none}
          </Row>
          <Row label={m.ai_plan_context_races()}>
            {athlete.races.length ? (
              <ul className="space-y-1">
                {athlete.races.map((race, index) => (
                  <li key={index}>
                    {race.name} · {date(race.date)}
                    {race.goal
                      ? ` · ${m.ai_plan_context_race_goal()}`
                      : race.priority === 'TARGET'
                        ? ` · ${m.ai_plan_context_race_target()}`
                        : race.priority === 'PREPARATORY'
                          ? ` · ${m.ai_plan_context_race_preparatory()}`
                          : ''}
                  </li>
                ))}
              </ul>
            ) : (
              none
            )}
          </Row>
          <Row label={m.ai_plan_context_calendar()}>
            {context.conflicts.sessions || context.conflicts.plans.length
              ? [
                  m.ai_plan_context_calendar_sessions({
                    count: String(context.conflicts.sessions),
                  }),
                  ...context.conflicts.plans.map((plan) => plan.name),
                ].join(' · ')
              : none}
          </Row>
        </dl>
      )}
      <PlanningEvidenceSummary evidence={athlete?.evidence} />
    </section>
  );
}
