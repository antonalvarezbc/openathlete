import { ManagedPlan } from '@/api/plan-workspace/plan-workspace.api';
import { displayDate } from '@/components/plan-workspace/helpers';
import { PlanWeekCalendar } from '@/components/plan-workspace/plan-week-calendar';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { cn } from '@/utils/shadcn';
import { CalendarRange } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

interface P {
  plan: ManagedPlan;
  editable: boolean;
  calendarPath: string;
}

/**
 * Plan weeks as a selectable strip, with the selected week shown in the
 * calendar's week view right below.
 */
export function PlanWeeks({ plan, editable, calendarPath }: P) {
  const weeks = useMemo(
    () =>
      plan.cycles
        .flatMap((cycle) => cycle.weeks.map((week) => ({ ...week, cycle })))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [plan],
  );
  const current = useMemo(() => {
    const now = Date.now();
    return (
      weeks.find(
        (week) =>
          Date.parse(week.startDate) <= now && Date.parse(week.endDate) >= now,
      ) ?? weeks[0]
    );
  }, [weeks]);
  const [selectedId, setSelectedId] = useState<number | undefined>(
    current?.trainingWeekId,
  );
  const selected =
    weeks.find((week) => week.trainingWeekId === selectedId) ?? current;

  if (!weeks.length)
    return (
      <p className="text-sm text-muted-foreground">
        {m.workspace_empty_weeks_help()}
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">{m.workspace_weeks()}</h4>
        {selected && (
          <Button asChild variant="outline" size="sm">
            <Link
              to={`${calendarPath}?trainingPlanId=${plan.trainingPlanId}&date=${encodeURIComponent(selected.startDate)}&view=week`}
            >
              <CalendarRange className="size-4" />
              {m.workspace_open_week_in_calendar()}
            </Link>
          </Button>
        )}
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-2"
        role="tablist"
        aria-label={m.workspace_weeks()}
      >
        {weeks.map((week) => {
          const active = week.trainingWeekId === selected?.trainingWeekId;
          return (
            <button
              key={week.trainingWeekId}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedId(week.trainingWeekId)}
              className={cn(
                'min-w-40 shrink-0 rounded-lg border border-l-4 p-3 text-left text-sm hover:bg-muted',
                active && 'bg-muted ring-2 ring-primary',
              )}
              style={
                week.cycle.color
                  ? { borderLeftColor: week.cycle.color }
                  : undefined
              }
            >
              <p className="font-medium">
                {m.week()} {week.weekNumber}
              </p>
              <p className="truncate text-muted-foreground">
                {week.cycle.name}
              </p>
              <p>
                {displayDate(week.startDate)} – {displayDate(week.endDate)}
              </p>
              {week.theme && (
                <p className="truncate text-xs text-muted-foreground">
                  {week.theme}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {week._count.sessions} {m.events()}
              </p>
            </button>
          );
        })}
      </div>
      {selected && (
        <PlanWeekCalendar
          plan={plan}
          weekStart={selected.startDate}
          editable={editable}
        />
      )}
    </div>
  );
}
