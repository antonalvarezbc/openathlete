import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { sportTypeLabelMap } from '@/utils/label-map/core/sport-type.label-map';
import { getDateLocale } from '@/utils/locales';
import { cn } from '@/utils/shadcn';

import {
  CalendarWeekLoadSummary,
  formatDistance,
  formatDuration,
} from '@openathlete/shared';

import { LoadStat } from '../numeric-stats';
import { SportIcon } from '../sport-icon/sport-icon';
import { useCalendarContext } from './hooks/use-calendar-context';
import { DayLoad, WeekTotals } from './utils/week-stats';

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

/** Progress towards a target; the bar caps at 100% and the text shows the rest. */
function TargetBar({
  value,
  target,
  showText = true,
}: {
  value: number;
  target: number;
  showText?: boolean;
}) {
  const percent = target > 0 ? Math.round((value / target) * 100) : 0;
  return (
    <div className="space-y-1">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
      >
        <div
          className={cn(
            'h-full rounded-full',
            percent > 110 ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      {showText && (
        <p className="text-xs text-muted-foreground">
          {m.week_target_progress({ percent })}
        </p>
      )}
    </div>
  );
}

function StatCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-lg border p-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

interface P {
  days: Date[];
  dayLoads: DayLoad[];
  totals: WeekTotals;
  weekLoad?: CalendarWeekLoadSummary;
  loadLoading: boolean;
}

/** Planned vs done volume and load for the displayed week. */
export function CalendarWeekPanel({
  days,
  dayLoads,
  totals,
  weekLoad,
  loadLoading,
}: P) {
  const { weekOverview } = useCalendarContext();
  const target = weekOverview?.planWeek;
  const locale = getDateLocale(getLocale());
  const maxDayLoad = Math.max(
    1,
    ...dayLoads.map((load) => load.actual + load.planned),
  );
  const totalLoad = weekLoad?.totalLoad ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={m.week_panel_load()}>
          <p className="text-2xl font-semibold">
            {loadLoading ? '…' : numberFormatter.format(totalLoad)}
          </p>
          <p className="text-xs text-muted-foreground">
            {m.week_panel_load_split({
              actual: numberFormatter.format(weekLoad?.actualLoad ?? 0),
              planned: numberFormatter.format(weekLoad?.estimatedLoad ?? 0),
            })}
          </p>
          {target?.targetLoad != null && (
            <>
              <p className="text-sm">
                {m.week_panel_target({
                  value: numberFormatter.format(target.targetLoad),
                })}
              </p>
              <TargetBar value={totalLoad} target={target.targetLoad} />
            </>
          )}
          <LoadStat
            totalLoad={weekLoad?.totalLoad}
            actualLoad={weekLoad?.actualLoad}
            plannedLoad={weekLoad?.estimatedLoad}
            recommendedMin={weekLoad?.recommendedMin}
            recommendedMax={weekLoad?.recommendedMax}
            isLoading={loadLoading}
          />
        </StatCard>

        <StatCard title={m.week_panel_volume()}>
          <p className="text-2xl font-semibold">
            {formatDuration(totals.done.duration)}
          </p>
          <p className="text-xs text-muted-foreground">
            {m.week_panel_volume_planned({
              value: formatDuration(totals.planned.duration),
            })}
          </p>
          {target?.targetVolume != null && (
            <>
              <p className="text-sm">
                {m.week_panel_target({
                  value: formatDuration(target.targetVolume),
                })}
              </p>
              <TargetBar
                value={totals.done.duration}
                target={target.targetVolume}
              />
            </>
          )}
        </StatCard>

        <StatCard title={m.week_panel_sessions()}>
          <p className="text-2xl font-semibold">
            {m.done_summary({
              done: totals.sessionsDone,
              total: totals.sessionsPlanned,
            })}
          </p>
          {totals.sessionsPlanned > 0 && (
            <TargetBar
              value={totals.sessionsDone}
              target={totals.sessionsPlanned}
              showText={false}
            />
          )}
        </StatCard>

        <StatCard title={m.week_panel_distance()}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{m.done()}</dt>
            <dd>
              {formatDistance(totals.done.distance, 'km')} km ·{' '}
              {numberFormatter.format(totals.done.elevation)} m D+
            </dd>
            <dt className="text-muted-foreground">{m.planned()}</dt>
            <dd>
              {formatDistance(totals.planned.distance, 'km')} km ·{' '}
              {numberFormatter.format(totals.planned.elevation)} m D+
            </dd>
          </dl>
        </StatCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <StatCard title={m.week_panel_daily_load()}>
          <div
            className="flex h-32 items-end gap-2"
            role="img"
            aria-label={m.week_panel_daily_load()}
          >
            {days.map((day, index) => {
              const load = dayLoads[index];
              const height = (value: number) =>
                `${(value / maxDayLoad) * 100}%`;
              return (
                <div
                  key={day.toISOString()}
                  className="flex h-full flex-1 flex-col items-center gap-1"
                  title={m.week_day_load_title({
                    actual: numberFormatter.format(load.actual),
                    planned: numberFormatter.format(load.planned),
                  })}
                >
                  <div className="flex w-full flex-1 flex-col justify-end">
                    <div
                      className="w-full rounded-t-sm bg-primary/30"
                      style={{ height: height(load.planned) }}
                    />
                    <div
                      className="w-full bg-primary"
                      style={{ height: height(load.actual) }}
                    />
                  </div>
                  <span className="text-xs capitalize text-muted-foreground">
                    {day.toLocaleDateString(locale, { weekday: 'narrow' })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-primary" />
              {m.week_panel_actual()}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-primary/30" />
              {m.week_panel_pending()}
            </span>
          </div>
        </StatCard>

        <StatCard title={m.week_panel_by_sport()}>
          {totals.bySport.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="font-normal">{m.sport()}</th>
                  <th className="font-normal text-right">{m.planned()}</th>
                  <th className="font-normal text-right">{m.done()}</th>
                </tr>
              </thead>
              <tbody>
                {totals.bySport.map((entry) => (
                  <tr key={entry.sport}>
                    <td className="py-1">
                      <SportIcon
                        sport={entry.sport}
                        className="mr-1.5 inline-block"
                      />
                      {sportTypeLabelMap[entry.sport]}
                    </td>
                    <td className="py-1 text-right">
                      {formatDuration(entry.planned)}
                    </td>
                    <td className="py-1 text-right">
                      {formatDuration(entry.done)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {m.week_panel_empty()}
            </p>
          )}
        </StatCard>
      </div>
    </div>
  );
}
