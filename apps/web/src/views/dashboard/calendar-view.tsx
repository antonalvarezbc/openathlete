import { useGetMyAthleteQuery } from '@/api/athlete';
import { useGetMyEventsQuery } from '@/api/event';
import { useInstallationFeatures } from '@/api/installation/installation.hooks';
import { ActivityFeedbackDialog } from '@/components/activity-feedback/activity-feedback-dialog';
import { Calendar } from '@/components/calendar/calendar';
import { AthleteDashboardHeader } from '@/components/dashboard/athlete-dashboard-header';
import { ImportFitDialog } from '@/components/import-fit-dialog/import-fit-dialog';
import {
  CalendarPlanBanner,
  useCalendarPlan,
} from '@/components/plan-workspace/use-calendar-plan';
import { useUserRoles } from '@/contexts/auth';
import { useSpaceContext } from '@/contexts/space';
import { useIsMobile } from '@/hooks/use-mobile';
import { m } from '@/paraglide/messages';
import { cn } from '@/utils/shadcn';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ActivityEvent,
  ActivityFeedbackQuestion,
  EVENT_TYPE,
} from '@openathlete/shared';

export function CalendarView() {
  const isMobile = useIsMobile();
  const roles = useUserRoles();
  const { manualFitImport } = useInstallationFeatures();
  const { data: athlete } = useGetMyAthleteQuery();
  const { space } = useSpaceContext();
  const calendarPlan = useCalendarPlan(athlete?.athleteId);
  const [displayedMonth, setDisplayedMonth] = useState(new Date());
  const [pendingFeedbackEvent, setPendingFeedbackEvent] =
    useState<ActivityEvent | null>(null);
  const [dismissedFeedbackEvents, setDismissedFeedbackEvents] = useState<
    Set<number>
  >(new Set());

  const { startDate, endDate } = useMemo(() => {
    if (isMobile) {
      const start = new Date(
        displayedMonth.getFullYear(),
        displayedMonth.getMonth() - 6,
        1,
      );
      const end = new Date(
        displayedMonth.getFullYear(),
        displayedMonth.getMonth() + 12,
        0,
      );
      end.setHours(23, 59, 59, 999);
      return { startDate: start, endDate: end };
    } else {
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
    }
  }, [displayedMonth, isMobile]);

  const { data, refetch, isPending } = useGetMyEventsQuery(
    undefined,
    undefined,
    startDate,
    endDate,
  );

  useEffect(() => {
    refetch();
  }, [startDate, endDate, refetch]);

  useEffect(() => {
    if (space !== 'ATHLETE' || !data || !athlete || isPending) {
      return;
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const unratedActivity = data.find((event) => {
      if (event.type !== EVENT_TYPE.ACTIVITY) return false;

      const activityEvent = event as ActivityEvent;
      if (dismissedFeedbackEvents.has(activityEvent.eventId)) {
        return false;
      }
      if (activityEvent.athleteId !== athlete.athleteId) return false;
      const eventEndDate = new Date(activityEvent.endDate);
      if (eventEndDate < twentyFourHoursAgo || eventEndDate > now) {
        return false;
      }
      const questions = activityEvent.feedbackQuestions ?? [];
      if (questions.length === 0) return false;
      const feedbackSkipped =
        'feedbackSkipped' in activityEvent &&
        (activityEvent as { feedbackSkipped?: boolean }).feedbackSkipped ===
          true;
      if (feedbackSkipped) return false;
      const allUnanswered = questions.every(
        (q: ActivityFeedbackQuestion) => q.answerText === null,
      );

      return allUnanswered;
    });

    if (unratedActivity && !pendingFeedbackEvent) {
      setPendingFeedbackEvent(unratedActivity as ActivityEvent);
    }
  }, [
    data,
    space,
    athlete,
    pendingFeedbackEvent,
    isPending,
    dismissedFeedbackEvents,
  ]);

  const handleMonthChange = useCallback((month: Date) => {
    setDisplayedMonth(month);
  }, []);

  const handleFeedbackDialogClose = () => {
    if (pendingFeedbackEvent) {
      setDismissedFeedbackEvents((prev) => {
        const newSet = new Set(prev);
        newSet.add(pendingFeedbackEvent.eventId);
        return newSet;
      });
    }
    setPendingFeedbackEvent(null);
  };

  if (calendarPlan.isLoading) return <p className="p-6">{m.loading()}</p>;
  if (calendarPlan.isError)
    return (
      <p role="alert" className="p-6 text-destructive">
        {m.workspace_failed()}
      </p>
    );
  return (
    <div
      className={cn(
        'w-full flex flex-col h-full',
        isMobile ? 'p-0' : 'p-4 md:p-8',
      )}
    >
      {space === 'ATHLETE' && (
        <AthleteDashboardHeader athleteId={athlete?.athleteId} />
      )}
      {manualFitImport &&
        space === 'ATHLETE' &&
        roles?.includes('ATHLETE') &&
        athlete && (
          <div className="flex justify-end px-4 py-3 md:px-0">
            <ImportFitDialog />
          </div>
        )}
      {calendarPlan.plan && <CalendarPlanBanner plan={calendarPlan.plan} />}
      <div className="flex-1 min-h-0">
        <Calendar
          key={calendarPlan.planId ?? 0}
          trainingPlanId={calendarPlan.planId}
          initialDate={
            calendarPlan.planId ? calendarPlan.initialDate : undefined
          }
          events={data}
          athleteId={space === 'ATHLETE' ? athlete?.athleteId : undefined}
          allowCreate={
            space === 'ATHLETE' &&
            (!calendarPlan.plan ||
              ['ACTIVE', 'DRAFT'].includes(calendarPlan.plan.status))
          }
          onMonthChange={handleMonthChange}
          isLoading={isPending}
        />
      </div>
      {pendingFeedbackEvent && (
        <ActivityFeedbackDialog
          event={pendingFeedbackEvent}
          open={!!pendingFeedbackEvent}
          onClose={handleFeedbackDialogClose}
        />
      )}
    </div>
  );
}
