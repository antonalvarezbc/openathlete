import { m } from '@/paraglide/messages';
import { useMemo } from 'react';

import { EVENT_TYPE } from '@openathlete/shared';

import { Loader } from '../ui/loader';
import { CalendarDay } from './calendar-day';
import { CalendarWeekActions } from './calendar-week-actions';
import { CalendarWeekPanel } from './calendar-week-panel';
import { CalendarWeekPlanBar } from './calendar-week-plan-bar';
import { useCalendarContext } from './hooks/use-calendar-context';
import { calculateCyclesForDay } from './utils/cycle-day-layout';
import { getWeekKey } from './utils/week';
import { dayLoads, weekTotals } from './utils/week-stats';

/**
 * One week of the calendar: plan context, week actions, seven day columns
 * (stacked on mobile) and planned vs done figures. Day cells are the month
 * view's cells, so drag and drop, context menus and templates keep working.
 */
export function CalendarWeekView({ isLoading }: { isLoading?: boolean }) {
  const {
    displayedWeeks,
    events,
    cycles,
    cycleResize,
    weekStart,
    weekOverview,
    weeklyLoadSummary,
    weeklyLoadSummaryLoading,
    estimatingEvents,
    allowCreate,
  } = useCalendarContext();
  const days = displayedWeeks[0];

  const weekEvents = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    return events.filter((event) => {
      const start = new Date(event.startDate);
      return start >= weekStart && start < end;
    });
  }, [events, weekStart]);

  const loads = useMemo(
    () => dayLoads(days, weekEvents, weekOverview?.activityLoads),
    [days, weekEvents, weekOverview],
  );
  const totals = useMemo(() => weekTotals(weekEvents), [weekEvents]);
  const displayedCycles = cycles.map((cycle) =>
    cycleResize && cycle.cycleId === cycleResize.cycleId
      ? {
          ...cycle,
          startDate: cycleResize.currentStart,
          endDate: cycleResize.currentEnd,
        }
      : cycle,
  );
  const loadLoading =
    weeklyLoadSummaryLoading ||
    weekEvents.some(
      (event) =>
        event.type === EVENT_TYPE.TRAINING &&
        estimatingEvents.has(event.eventId),
    );

  return (
    <div
      data-calendar-week
      className="flex flex-col gap-3 px-4 md:px-0"
      aria-busy={isLoading}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <CalendarWeekPlanBar />
        </div>
        {allowCreate && (
          <div className="self-end sm:self-auto">
            <CalendarWeekActions weekEvents={weekEvents} />
          </div>
        )}
      </div>

      <div className="relative">
        <div
          className={
            isLoading ? 'opacity-50 transition-opacity' : 'transition-opacity'
          }
        >
          <div className="flex w-full flex-col rounded-lg border-1 shadow-sm md:grid md:grid-cols-7">
            {days.map((day, index) => (
              <CalendarDay
                key={day.toISOString()}
                day={day}
                variant="week"
                dayLoad={loads[index]}
                events={weekEvents.filter(
                  (event) =>
                    new Date(event.startDate).toDateString() ===
                      day.toDateString() &&
                    !(
                      (event.type === EVENT_TYPE.COMPETITION ||
                        event.type === EVENT_TYPE.TRAINING) &&
                      event.relatedActivity
                    ),
                )}
                cycleSegments={calculateCyclesForDay(displayedCycles, day)}
              />
            ))}
          </div>
        </div>
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Loader size="lg" />
              <p className="text-sm text-muted-foreground">{m.loading()}</p>
            </div>
          </div>
        )}
      </div>

      <CalendarWeekPanel
        days={days}
        dayLoads={loads}
        totals={totals}
        weekLoad={weeklyLoadSummary[getWeekKey(weekStart)]}
        loadLoading={loadLoading}
      />
    </div>
  );
}
