import { useGetMyEventsQuery } from '@/api/event';
import { Calendar } from '@/components/calendar/calendar';
import { CoachTrainingLoadSummary } from '@/components/dashboard/coach-training-load-summary';
import { UpcomingCompetitions } from '@/components/dashboard/upcoming-competitions';
import {
  CalendarPlanBanner,
  useCalendarPlan,
} from '@/components/plan-workspace/use-calendar-plan';
import { Card, CardContent } from '@/components/ui/card';
import { m } from '@/paraglide/messages';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

interface P {
  athleteId: number;
}

export function AthleteCalendarView({ athleteId }: P) {
  const calendarPlan = useCalendarPlan(athleteId);
  const [displayedMonth, setDisplayedMonth] = useState(new Date());

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

  const { data, refetch, isError, isFetching } = useGetMyEventsQuery(
    true,
    athleteId,
    startDate,
    endDate,
    {
      retry: false,
    },
  );

  useEffect(() => {
    refetch();
  }, [athleteId, startDate, endDate, refetch]);

  const handleMonthChange = useCallback((month: Date) => {
    setDisplayedMonth(month);
  }, []);

  if (calendarPlan.isLoading) return <p className="p-6">{m.loading()}</p>;
  if (calendarPlan.isError)
    return (
      <p role="alert" className="p-6 text-destructive">
        {m.workspace_failed()}
      </p>
    );
  if (isError) {
    return <Navigate to="/404" />;
  }
  return (
    <div className="w-full p-4 md:p-8">
      <Card className="mb-6">
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <UpcomingCompetitions key={athleteId} athleteId={athleteId} isCoach />
          <CoachTrainingLoadSummary athleteId={athleteId} />
        </CardContent>
      </Card>
      {calendarPlan.plan && <CalendarPlanBanner plan={calendarPlan.plan} />}
      <Calendar
        key={`${athleteId}-${calendarPlan.planId ?? 0}`}
        trainingPlanId={calendarPlan.planId}
        initialDate={calendarPlan.planId ? calendarPlan.initialDate : undefined}
        initialView={calendarPlan.view}
        allowCreate={
          !calendarPlan.plan ||
          ['ACTIVE', 'DRAFT'].includes(calendarPlan.plan.status)
        }
        events={data}
        athleteId={athleteId}
        onMonthChange={handleMonthChange}
        isLoading={isFetching}
      />
    </div>
  );
}
