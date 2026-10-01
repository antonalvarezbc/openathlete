import { useGetMyEventsQuery } from '@/api/event';
import { ManagedPlan } from '@/api/plan-workspace/plan-workspace.api';
import { Calendar } from '@/components/calendar/calendar';
import { useCallback, useMemo, useState } from 'react';

interface P {
  plan: ManagedPlan;
  weekStart: string;
  editable: boolean;
}

/** The calendar locked to week view for one plan week, inside Planning. */
export function PlanWeekCalendar({ plan, weekStart, editable }: P) {
  const initialDate = useMemo(() => new Date(weekStart), [weekStart]);
  const [displayedMonth, setDisplayedMonth] = useState(initialDate);
  const { startDate, endDate } = useMemo(() => {
    const start = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() - 1,
      1,
    );
    const end = new Date(
      displayedMonth.getFullYear(),
      displayedMonth.getMonth() + 2,
      0,
    );
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }, [displayedMonth]);
  const { data, isFetching } = useGetMyEventsQuery(
    true,
    plan.athleteId,
    startDate,
    endDate,
  );
  const handleMonthChange = useCallback((month: Date) => {
    setDisplayedMonth(month);
  }, []);

  return (
    <Calendar
      key={`${plan.trainingPlanId}-${weekStart}`}
      events={data}
      athleteId={plan.athleteId}
      trainingPlanId={plan.trainingPlanId}
      initialDate={initialDate}
      initialView="week"
      lockView
      allowCreate={editable}
      onMonthChange={handleMonthChange}
      isLoading={isFetching}
    />
  );
}
