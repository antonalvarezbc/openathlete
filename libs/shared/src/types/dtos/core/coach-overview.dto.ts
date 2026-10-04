import z from 'zod';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Longest window the overview reads, past and upcoming days together. */
export const COACH_OVERVIEW_MAX_DAYS = 120;

/**
 * Day boundaries come from the coach's browser, so "today" and "missed"
 * follow the coach's time zone rather than the server's.
 */
export const coachOverviewQuerySchema = z
  .object({
    /** Start of the first day reviewed. */
    from: z.coerce.date(),
    /** Start of today: sessions before it are due. */
    today: z.coerce.date(),
    /** End (exclusive) of the upcoming days. */
    until: z.coerce.date(),
  })
  .strict()
  .refine(
    (query) =>
      query.from <= query.today &&
      query.today.getTime() + DAY_MS <= query.until.getTime(),
    { message: 'Expected from <= today and until at least one day later' },
  )
  .refine(
    (query) =>
      query.until.getTime() - query.from.getTime() <=
      COACH_OVERVIEW_MAX_DAYS * DAY_MS,
    { message: `At most ${COACH_OVERVIEW_MAX_DAYS} days` },
  );

export type CoachOverviewQueryDto = z.infer<typeof coachOverviewQuerySchema>;

export type CoachOverviewSessionDto = {
  eventId: number;
  name: string;
  startDate: string;
  sport: string;
};

export type CoachOverviewAthleteDto = {
  athleteId: number;
  firstName: string | null;
  lastName: string | null;
  /** The coach's own athlete profile (coaching yourself). */
  isSelf: boolean;
  /** Sessions planned from `from` to the start of today. */
  due: number;
  /** Due sessions with a linked activity. */
  done: number;
  /** done / due, rounded; null without due sessions. */
  compliancePercent: number | null;
  /** Goal duration of due sessions that have one (seconds). */
  plannedTime: number;
  /** Moving time of the activities linked to those sessions (seconds). */
  completedTime: number;
  /** completedTime / plannedTime, rounded; null without planned time. */
  timePercent: number | null;
  /** Latest due sessions without an activity, newest first (up to 3). */
  missed: CoachOverviewSessionDto[];
  missedCount: number;
  todayPlanned: number;
  todayDone: number;
  /** Sessions from tomorrow until `until`. */
  upcoming: number;
  /** Activities from `from` to the end of today linked to no session. */
  unlinkedActivities: number;
  /** Start of the athlete's latest activity, at any date. */
  lastActivityAt: string | null;
  /** Injuries not marked as resolved. */
  activeInjuries: number;
};

export type CoachOverviewResponseDto = {
  athletes: CoachOverviewAthleteDto[];
};
