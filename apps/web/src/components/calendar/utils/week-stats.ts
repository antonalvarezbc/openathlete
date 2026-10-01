import {
  EVENT_TYPE,
  Event,
  SPORT_TYPE,
  TrainingEvent,
} from '@openathlete/shared';

export interface DayLoad {
  actual: number;
  planned: number;
}

export interface WeekTotals {
  sessionsPlanned: number;
  sessionsDone: number;
  /** Goals of every planned session and race, done or not. */
  planned: { duration: number; distance: number; elevation: number };
  /** Recorded activities. */
  done: { duration: number; distance: number; elevation: number };
  bySport: { sport: SPORT_TYPE; planned: number; done: number }[];
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * Load per day: actual TRIMP of activities (from the week overview) and the
 * estimated load of sessions not done yet, matching the weekly summary rules.
 */
export function dayLoads(
  days: Date[],
  events: Event[],
  activityLoads: Record<number, number> = {},
): DayLoad[] {
  return days.map((day) => {
    const load = { actual: 0, planned: 0 };
    for (const event of events) {
      if (!sameDay(new Date(event.startDate), day)) continue;
      if (event.type === EVENT_TYPE.ACTIVITY)
        load.actual += activityLoads[event.eventId] ?? 0;
      else if (
        event.type === EVENT_TYPE.TRAINING &&
        !event.relatedActivityId &&
        !event.relatedActivity
      )
        load.planned += event.estimatedLoad ?? 0;
    }
    return load;
  });
}

export function weekTotals(events: Event[]): WeekTotals {
  const totals: WeekTotals = {
    sessionsPlanned: 0,
    sessionsDone: 0,
    planned: { duration: 0, distance: 0, elevation: 0 },
    done: { duration: 0, distance: 0, elevation: 0 },
    bySport: [],
  };
  const sports = new Map<SPORT_TYPE, { planned: number; done: number }>();
  const sport = (key: SPORT_TYPE) => {
    const entry = sports.get(key) ?? { planned: 0, done: 0 };
    sports.set(key, entry);
    return entry;
  };
  for (const event of events) {
    if (
      event.type === EVENT_TYPE.TRAINING ||
      event.type === EVENT_TYPE.COMPETITION
    ) {
      totals.sessionsPlanned++;
      if (event.relatedActivityId || event.relatedActivity)
        totals.sessionsDone++;
      totals.planned.duration += event.goalDuration ?? 0;
      totals.planned.distance += event.goalDistance ?? 0;
      totals.planned.elevation += event.goalElevationGain ?? 0;
      sport(event.sport).planned += event.goalDuration ?? 0;
    } else if (event.type === EVENT_TYPE.ACTIVITY) {
      totals.done.duration += event.movingTime ?? 0;
      totals.done.distance += event.distance ?? 0;
      totals.done.elevation += event.elevationGain ?? 0;
      sport(event.sport).done += event.movingTime ?? 0;
    }
  }
  totals.bySport = [...sports.entries()]
    .map(([key, value]) => ({ sport: key, ...value }))
    .filter((entry) => entry.planned > 0 || entry.done > 0)
    .sort((a, b) => b.planned + b.done - (a.planned + a.done));
  return totals;
}

/** Sessions that week actions may copy (planned sessions, done or not, and notes). */
export const isCopyable = (event: Event) =>
  event.type === EVENT_TYPE.NOTE || event.type === EVENT_TYPE.TRAINING;

/** Sessions that week actions may move or delete (not done yet) and notes. */
export const isMovable = (event: Event) =>
  event.type === EVENT_TYPE.NOTE ||
  (event.type === EVENT_TYPE.TRAINING &&
    !(event as TrainingEvent).relatedActivityId &&
    !(event as TrainingEvent).relatedActivity);

/**
 * Same weekday and time in another week, computed in local time so a
 * daylight-saving change between weeks does not shift sessions.
 */
export function shiftToWeek(
  event: Pick<Event, 'startDate' | 'endDate'>,
  fromWeekStart: Date,
  toWeekStart: Date,
) {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const dayOffset = Math.round(
    (Date.UTC(
      toWeekStart.getFullYear(),
      toWeekStart.getMonth(),
      toWeekStart.getDate(),
    ) -
      Date.UTC(
        fromWeekStart.getFullYear(),
        fromWeekStart.getMonth(),
        fromWeekStart.getDate(),
      )) /
      86_400_000,
  );
  const newStart = new Date(start);
  newStart.setDate(newStart.getDate() + dayOffset);
  const newEnd = new Date(end);
  newEnd.setDate(newEnd.getDate() + dayOffset);
  return { startDate: newStart, endDate: newEnd };
}
