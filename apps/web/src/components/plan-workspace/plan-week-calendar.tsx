import { useGetMyEventsQuery } from '@/api/event';
import { Calendar } from '@/components/calendar/calendar';
import { useCallback, useMemo, useState } from 'react';

interface P {
  athleteId: number;
  /** New sessions join this plan; without it they are plain calendar sessions. */
  trainingPlanId?: number;
  weekStart: string;
  editable: boolean;
}

/** The athlete's calendar locked to week view for one week, inside Planning. */
export function PlanWeekCalendar({
  athleteId,
  trainingPlanId,
  weekStart,
  editable,
}: P) {
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
    athleteId,
    startDate,
    endDate,
  );
  const handleMonthChange = useCallback((month: Date) => {
    setDisplayedMonth(month);
  }, []);

  return (
    <Calendar
      key={`${trainingPlanId ?? 'calendar'}-${weekStart}`}
      events={data}
      athleteId={athleteId}
      trainingPlanId={trainingPlanId}
      initialDate={initialDate}
      initialView="week"
      lockView
      allowCreate={editable}
      onMonthChange={handleMonthChange}
      isLoading={isFetching}
    />
  );
}
