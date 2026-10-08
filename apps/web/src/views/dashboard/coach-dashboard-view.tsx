import { useCoachOverviewQuery } from '@/api/coach';
import { CoachAthletesSection } from '@/components/coach-dashboard/coach-athletes-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { getPath } from '@/routes/paths';
import { cn } from '@/utils/shadcn';
import { Calendar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { CoachOverviewAthleteDto } from '@openathlete/shared';

import {
  type AttentionReason,
  OVERVIEW_PERIODS,
  type OverviewPeriod,
  byCompliance,
  fullName,
  needsAttention,
  overviewRange,
  teamSummary,
} from './coach-home/coach-overview';

const percentText = (value: number) =>
  new Intl.NumberFormat(getLocale(), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value / 100);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(getLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/** "today", "yesterday", "3 days ago"… in the user's language. */
function daysAgo(iso: string, now: Date) {
  const start = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((start(now) - start(new Date(iso))) / 86_400_000);
  return new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(
    -days,
    'day',
  );
}

const complianceColor = (percent: number) =>
  percent >= 80
    ? 'bg-emerald-500'
    : percent >= 50
      ? 'bg-amber-500'
      : 'bg-red-500';

function reasonText(reason: AttentionReason) {
  switch (reason.kind) {
    case 'injury':
      return m.coach_home_reason_injury({ count: reason.count });
    case 'missed':
      return `${m.coach_home_reason_missed({ count: reason.count })} · ${reason.sessions
        .map((session) => `${session.name} (${shortDate(session.startDate)})`)
        .join(', ')}`;
    case 'low_compliance':
      return m.coach_home_reason_low_compliance({
        percent: percentText(reason.percent),
      });
    case 'inactive':
      return reason.days === null
        ? m.coach_home_reason_never_active()
        : m.coach_home_reason_inactive({ days: reason.days });
    case 'no_plan':
      return m.coach_home_reason_no_plan();
    case 'unlinked':
      return m.coach_home_reason_unlinked({ count: reason.count });
  }
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 text-sm text-muted-foreground">
        {hint}
      </CardContent>
    </Card>
  );
}

function AthleteName({ athlete }: { athlete: CoachOverviewAthleteDto }) {
  return (
    <span className="flex flex-wrap items-center gap-2 font-medium">
      {fullName(athlete)}
      {athlete.isSelf && (
        <Badge variant="secondary">{m.coach_self_you()}</Badge>
      )}
    </span>
  );
}

/**
 * Coach landing page: how the athletes follow their plan, who needs
 * attention and what is planned today, with a link to each calendar.
 */
export function CoachDashboardView() {
  const nav = useNavigate();
  const [period, setPeriod] = useState<OverviewPeriod>(7);
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => overviewRange(period, now), [period, now]);
  const { data, isLoading, isError } = useCoachOverviewQuery(range);
  const athletes = data?.athletes ?? [];
  const summary = teamSummary(athletes);
  const attention = needsAttention(athletes, now);
  const openCalendar = (athleteId: number) =>
    nav(getPath(['dashboard', 'calendar']) + `/${athleteId}`);
  const calendarButton = (athlete: CoachOverviewAthleteDto) => (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={() => openCalendar(athlete.athleteId)}
    >
      <Calendar className="size-4" />
      {m.view_calendar()}
    </Button>
  );

  return (
    <main className="w-full min-w-0 space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{m.coach_dashboard()}</h1>
          <p className="text-muted-foreground">{m.coach_home_subtitle()}</p>
        </div>
        <div
          role="group"
          aria-label={m.coach_home_period()}
          className="inline-flex rounded-md border p-0.5"
        >
          {OVERVIEW_PERIODS.map((days) => (
            <Button
              key={days}
              size="sm"
              variant={period === days ? 'secondary' : 'ghost'}
              aria-pressed={period === days}
              onClick={() => setPeriod(days)}
            >
              {m.coach_home_last_days({ days })}
            </Button>
          ))}
        </div>
      </div>

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {m.coach_home_failed()}
        </p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : !athletes.length && !isError ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {m.no_coached_athletes()}
            </p>
            <Button
              onClick={() =>
                nav(`${getPath(['dashboard', 'settings'])}?tab=athletes`)
              }
            >
              {m.invite_athlete()}
            </Button>
          </CardContent>
        </Card>
      ) : athletes.length ? (
        <>
          <section
            aria-label={m.coach_dashboard_title()}
            className="grid grid-cols-2 gap-4 lg:grid-cols-3"
          >
            <Stat
              label={m.coach_home_team_compliance()}
              value={
                summary.compliancePercent === null
                  ? '—'
                  : percentText(summary.compliancePercent)
              }
              hint={m.coach_home_sessions_done({
                done: summary.done,
                due: summary.due,
              })}
            />
            <Stat
              label={m.coach_home_today()}
              value={`${summary.todayDone}/${summary.todayPlanned}`}
              hint={m.coach_home_today_hint()}
            />
            <Stat
              label={m.coach_home_attention()}
              value={`${attention.length}/${athletes.length}`}
              hint={m.coach_home_attention_hint()}
            />
          </section>

          <Card data-attention>
            <CardHeader>
              <CardTitle>{m.coach_home_attention()}</CardTitle>
            </CardHeader>
            <CardContent>
              {attention.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {m.coach_home_all_good()}
                </p>
              ) : (
                <ul className="divide-y">
                  {attention.map(({ athlete, reasons }) => (
                    <li
                      key={athlete.athleteId}
                      data-athlete={athlete.athleteId}
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <AthleteName athlete={athlete} />
                        <ul className="space-y-0.5 text-sm">
                          {reasons.map((reason) => (
                            <li
                              key={reason.kind}
                              data-reason={reason.kind}
                              className={cn(
                                'break-words',
                                reason.kind === 'unlinked'
                                  ? 'text-muted-foreground'
                                  : 'text-amber-700 dark:text-amber-300',
                              )}
                            >
                              {reasonText(reason)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {calendarButton(athlete)}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card data-compliance>
            <CardHeader>
              <CardTitle>{m.coach_home_compliance_title()}</CardTitle>
              <CardDescription>
                {m.coach_home_compliance_help()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {byCompliance(athletes).map((athlete) => (
                  <li
                    key={athlete.athleteId}
                    data-athlete={athlete.athleteId}
                    className="grid gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center"
                  >
                    <AthleteName athlete={athlete} />
                    <div className="min-w-0 space-y-1.5">
                      {athlete.compliancePercent === null ? (
                        <p className="text-sm text-muted-foreground">
                          {m.coach_home_no_due()}
                        </p>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div
                            role="progressbar"
                            aria-label={m.compliance()}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={athlete.compliancePercent}
                            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                          >
                            <div
                              className={cn(
                                'h-full rounded-full',
                                complianceColor(athlete.compliancePercent),
                              )}
                              style={{
                                width: `${Math.min(athlete.compliancePercent, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="w-12 text-right text-sm font-medium tabular-nums">
                            {percentText(athlete.compliancePercent)}
                          </span>
                        </div>
                      )}
                      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {athlete.due > 0 && (
                          <span>
                            {m.coach_home_sessions_done({
                              done: athlete.done,
                              due: athlete.due,
                            })}
                          </span>
                        )}
                        {athlete.timePercent !== null && (
                          <span>
                            {m.coach_home_time({
                              percent: percentText(athlete.timePercent),
                            })}
                          </span>
                        )}
                        {athlete.todayPlanned > 0 && (
                          <span>
                            {m.coach_home_today_status({
                              done: athlete.todayDone,
                              planned: athlete.todayPlanned,
                            })}
                          </span>
                        )}
                        <span>
                          {m.coach_home_upcoming({ count: athlete.upcoming })}
                        </span>
                        <span>
                          {m.coach_home_last_activity({
                            when: athlete.lastActivityAt
                              ? daysAgo(athlete.lastActivityAt, now)
                              : m.coach_home_never(),
                          })}
                        </span>
                      </p>
                    </div>
                    {calendarButton(athlete)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <CoachAthletesSection />
        </>
      ) : null}
    </main>
  );
}
