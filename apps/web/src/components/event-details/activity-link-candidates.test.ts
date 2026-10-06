import { describe, expect, it } from 'vitest';

import {
  type ActivityEvent,
  EVENT_TYPE,
  type Event,
  SPORT_TYPE,
  type TrainingEvent,
} from '@openathlete/shared';

import { activityLinkCandidates } from './activity-link-candidates';

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute);

const activity = (
  eventId: number,
  start: Date,
  sport = SPORT_TYPE.RUNNING,
  name = `Activity ${eventId}`,
) =>
  ({
    eventId,
    type: EVENT_TYPE.ACTIVITY,
    name,
    sport,
    startDate: start,
    endDate: new Date(start.getTime() + 3600_000),
    distance: 8200,
  }) as unknown as ActivityEvent;

const session = (overrides: Partial<TrainingEvent> = {}) =>
  ({
    eventId: 1,
    type: EVENT_TYPE.TRAINING,
    name: 'Series',
    sport: SPORT_TYPE.RUNNING,
    startDate: at(6, 8),
    endDate: at(6, 9),
    ...overrides,
  }) as TrainingEvent;

describe('activityLinkCandidates', () => {
  it('puts the same day first: same sport, then closest in time', () => {
    const events: Event[] = [
      activity(10, at(6, 19), SPORT_TYPE.RUNNING),
      activity(11, at(6, 7), SPORT_TYPE.CYCLING),
      activity(12, at(6, 12), SPORT_TYPE.RUNNING),
      activity(13, at(5, 8), SPORT_TYPE.RUNNING),
    ];
    const { sameDay, nearby } = activityLinkCandidates(session(), events);
    expect(sameDay.map((a) => a.eventId)).toEqual([12, 10, 11]);
    expect(nearby.map((a) => a.eventId)).toEqual([13]);
  });

  it('orders nearby days by how close they are', () => {
    const { nearby } = activityLinkCandidates(session(), [
      activity(20, at(4, 8)),
      activity(21, at(7, 18)),
      activity(22, at(8, 8)),
    ]);
    expect(nearby.map((a) => a.eventId)).toEqual([21, 20, 22]);
  });

  it('leaves out activities linked elsewhere and those over three days away', () => {
    const linkedElsewhere = activity(30, at(6, 18));
    const { sameDay, nearby } = activityLinkCandidates(session(), [
      linkedElsewhere,
      session({ eventId: 2, relatedActivity: linkedElsewhere }),
      activity(31, at(2, 8)),
      activity(32, at(10, 8)),
      activity(33, at(6, 20)),
    ]);
    expect(sameDay.map((a) => a.eventId)).toEqual([33]);
    expect(nearby).toEqual([]);
  });

  it('works without calendar events', () => {
    expect(activityLinkCandidates(session())).toEqual({
      sameDay: [],
      nearby: [],
    });
  });
});
