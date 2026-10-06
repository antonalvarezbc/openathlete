import {
  type ActivityEvent,
  type CompetitionEvent,
  EVENT_TYPE,
  type Event,
  type TrainingEvent,
} from '@openathlete/shared';

/** Activities up to this many days around the session can be linked. */
const WINDOW_DAYS = 3;

export const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * Activities that can be linked to a session: not linked to another session
 * and within three days of it. Those of the same day come first, the session's
 * sport before others, then the closest in time.
 */
export function activityLinkCandidates(
  session: TrainingEvent | CompetitionEvent,
  events: Event[] = [],
) {
  const start = new Date(session.startDate);
  const from = new Date(session.startDate);
  from.setDate(from.getDate() - WINDOW_DAYS);
  const to = new Date(session.endDate);
  to.setDate(to.getDate() + WINDOW_DAYS);
  const linked = new Set(
    events.flatMap((event) =>
      (event.type === EVENT_TYPE.TRAINING ||
        event.type === EVENT_TYPE.COMPETITION) &&
      event.relatedActivity
        ? [event.relatedActivity.eventId]
        : [],
    ),
  );
  const gap = (activity: ActivityEvent) =>
    Math.abs(new Date(activity.startDate).getTime() - start.getTime());
  const activities = events.filter(
    (event): event is ActivityEvent =>
      event.type === EVENT_TYPE.ACTIVITY &&
      !linked.has(event.eventId) &&
      new Date(event.startDate) > from &&
      new Date(event.endDate) < to,
  );
  const sameDay = activities
    .filter((activity) => isSameLocalDay(new Date(activity.startDate), start))
    .sort(
      (a, b) =>
        Number(a.sport !== session.sport) - Number(b.sport !== session.sport) ||
        gap(a) - gap(b),
    );
  const nearby = activities
    .filter((activity) => !isSameLocalDay(new Date(activity.startDate), start))
    .sort((a, b) => gap(a) - gap(b));
  return { sameDay, nearby };
}
