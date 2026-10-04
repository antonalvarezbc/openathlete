import { useGetMyEventsQuery } from '@/api/event';
import { PlanWeekCalendar } from '@/components/plan-workspace/plan-week-calendar';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { cn } from '@/utils/shadcn';
import { CalendarRange } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { EVENT_TYPE } from '@openathlete/shared';

import { calendarWeeks } from './planning-selection';

interface P {
  athleteId: number;
  calendarPath: string;
}

/** Without a plan: the athlete's own calendar, week by week. */
export function CalendarWeeks({ athleteId, calendarPath }: P) {
  const weeks = useMemo(() => calendarWeeks(), []);
  // calendarWeeks starts two weeks back: index 2 is this week.
  const [selected, setSelected] = useState(2);
  const { data: events } = useGetMyEventsQuery(
    true,
    athleteId,
    weeks[0].start,
    weeks[weeks.length - 1].next,
  );
  const counts = weeks.map(
    ({ start, next }) =>
      events?.filter((event) => {
        const time = new Date(event.startDate).getTime();
        return (
          event.type === EVENT_TYPE.TRAINING &&
          time >= start.getTime() &&
          time < next.getTime()
        );
      }).length ?? 0,
  );
  const week = weeks[selected];
  const lastDay = (next: Date) => new Date(next.getTime() - 86400000);
  const short = (date: Date) =>
    date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium">{m.workspace_calendar_weeks()}</h4>
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link
            to={`${calendarPath}?date=${encodeURIComponent(week.start.toISOString())}&view=week`}
          >
            <CalendarRange className="size-4" />
            {m.workspace_open_week_in_calendar()}
          </Link>
        </Button>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-2"
        role="tablist"
        aria-label={m.workspace_calendar_weeks()}
      >
        {weeks.map(({ start, next }, index) => (
          <button
            key={start.getTime()}
            type="button"
            role="tab"
            aria-selected={index === selected}
            onClick={() => setSelected(index)}
            className={cn(
              'min-h-11 min-w-36 shrink-0 rounded-lg border p-3 text-left text-sm hover:bg-muted',
              index === selected && 'bg-muted ring-2 ring-primary',
            )}
          >
            <p className="font-medium">
              {index === 2 ? m.workspace_this_week() : m.week()}
            </p>
            <p>
              {short(start)} – {short(lastDay(next))}
            </p>
            <p className="text-xs text-muted-foreground">
              {counts[index]} {m.events()}
            </p>
          </button>
        ))}
      </div>
      <PlanWeekCalendar
        athleteId={athleteId}
        weekStart={week.start.toISOString()}
        editable
      />
    </div>
  );
}
