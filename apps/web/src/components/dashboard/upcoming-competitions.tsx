import { useGetUpcomingCompetitionsQuery } from '@/api/event';
import { Skeleton } from '@/components/ui/skeleton';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { getDateFnsLocale } from '@/utils/locales';
import { differenceInCalendarDays, format } from 'date-fns';
import { Calendar } from 'lucide-react';
import { useMemo } from 'react';

export function UpcomingCompetitions({
  athleteId,
  isCoach = false,
}: {
  athleteId?: number;
  isCoach?: boolean;
}) {
  const {
    data: upcomingCompetitionsData = [],
    isLoading: isLoadingCompetitions,
    isError,
  } = useGetUpcomingCompetitionsQuery(isCoach, athleteId, { retry: false });

  const upcomingCompetitions = useMemo(() => {
    return upcomingCompetitionsData.slice(0, 2);
  }, [upcomingCompetitionsData]);

  const getDaysUntil = (date: Date): string => {
    const diffDays = differenceInCalendarDays(date, new Date());
    if (diffDays === 0) return m.dashboard_header_today();
    if (diffDays === 1) return m.dashboard_header_tomorrow();
    return m.dashboard_header_days_until({ days: diffDays });
  };
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {m.dashboard_header_upcoming_competitions()}
      </h3>
      {isLoadingCompetitions ? (
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-xs text-destructive">
          {m.dashboard_header_competitions_error()}
        </p>
      ) : upcomingCompetitions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {m.dashboard_header_no_upcoming_competitions()}
        </p>
      ) : (
        <div className="space-y-1.5">
          {upcomingCompetitions.map((competition) => (
            <div
              key={competition.eventId}
              className="flex items-start gap-1.5 rounded-md bg-blue-50 p-2 dark:bg-blue-950/30"
            >
              <Calendar className="mt-0.5 h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-900 dark:text-blue-100 truncate">
                  {competition.name}
                </p>
                <p className="text-[10px] text-blue-700 dark:text-blue-300">
                  {getDaysUntil(competition.startDate)} •{' '}
                  {format(competition.startDate, 'MMM d', {
                    locale: getDateFnsLocale(getLocale()),
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
