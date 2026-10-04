import { describe, expect, it } from 'vitest';

import type { CoachOverviewAthleteDto } from '@openathlete/shared';

import {
  attentionReasons,
  byCompliance,
  needsAttention,
  overviewRange,
  teamSummary,
} from './coach-overview';

// Monday 5 October 2026, 10:30 local time.
const now = new Date(2026, 9, 5, 10, 30);
const daysAgo = (days: number) =>
  new Date(2026, 9, 5 - days, 7, 0).toISOString();

const athlete = (
  overrides: Partial<CoachOverviewAthleteDto> = {},
): CoachOverviewAthleteDto => ({
  athleteId: 1,
  firstName: 'Ana',
  lastName: 'Ruiz',
  isSelf: false,
  due: 4,
  done: 4,
  compliancePercent: 100,
  plannedTime: 0,
  completedTime: 0,
  timePercent: null,
  missed: [],
  missedCount: 0,
  todayPlanned: 1,
  todayDone: 0,
  upcoming: 3,
  unlinkedActivities: 0,
  lastActivityAt: daysAgo(1),
  activeInjuries: 0,
  ...overrides,
});

describe('overviewRange', () => {
  it('uses local midnights: N days back, today and the next week', () => {
    expect(overviewRange(7, now)).toEqual({
      from: new Date(2026, 8, 28),
      today: new Date(2026, 9, 5),
      until: new Date(2026, 9, 13),
    });
    expect(overviewRange(28, now).from).toEqual(new Date(2026, 8, 7));
  });
});

describe('attentionReasons', () => {
  it('finds nothing for an athlete on track', () => {
    expect(attentionReasons(athlete(), now)).toEqual([]);
  });

  it('flags only recently missed sessions', () => {
    const recent = {
      eventId: 9,
      name: 'Series',
      startDate: daysAgo(2),
      sport: 'RUNNING',
    };
    const old = { ...recent, eventId: 8, startDate: daysAgo(10) };
    expect(
      attentionReasons(athlete({ missed: [recent, old], missedCount: 2 }), now),
    ).toEqual([{ kind: 'missed', count: 1, sessions: [recent] }]);
    expect(
      attentionReasons(athlete({ missed: [old], missedCount: 1 }), now),
    ).toEqual([]);
  });

  it('flags low compliance only with at least two due sessions', () => {
    expect(
      attentionReasons(
        athlete({ due: 4, done: 1, compliancePercent: 25 }),
        now,
      ),
    ).toEqual([{ kind: 'low_compliance', percent: 25 }]);
    expect(
      attentionReasons(athlete({ due: 1, done: 0, compliancePercent: 0 }), now),
    ).toEqual([]);
    expect(
      attentionReasons(
        athlete({ due: 2, done: 1, compliancePercent: 50 }),
        now,
      ),
    ).toEqual([]);
  });

  it('flags five days without activity, or none at all', () => {
    expect(
      attentionReasons(athlete({ lastActivityAt: daysAgo(4) }), now),
    ).toEqual([]);
    expect(
      attentionReasons(athlete({ lastActivityAt: daysAgo(5) }), now),
    ).toEqual([{ kind: 'inactive', days: 5 }]);
    expect(attentionReasons(athlete({ lastActivityAt: null }), now)).toEqual([
      { kind: 'inactive', days: null },
    ]);
  });

  it('needs no new sessions while one is planned for today', () => {
    expect(
      attentionReasons(athlete({ upcoming: 0, todayPlanned: 1 }), now),
    ).toEqual([]);
    expect(
      attentionReasons(athlete({ upcoming: 0, todayPlanned: 0 }), now),
    ).toEqual([{ kind: 'no_plan' }]);
  });

  it('puts injuries first and ends with planning and linking hints', () => {
    expect(
      attentionReasons(
        athlete({
          upcoming: 0,
          todayPlanned: 0,
          unlinkedActivities: 2,
          activeInjuries: 1,
          lastActivityAt: daysAgo(8),
        }),
        now,
      ).map((reason) => reason.kind),
    ).toEqual(['injury', 'inactive', 'no_plan', 'unlinked']);
  });
});

describe('needsAttention', () => {
  it('lists the most serious first and ignores unlinked activities alone', () => {
    const list = needsAttention(
      [
        athlete({ athleteId: 1, firstName: 'Ana', unlinkedActivities: 3 }),
        athlete({
          athleteId: 2,
          firstName: 'Bea',
          upcoming: 0,
          todayPlanned: 0,
        }),
        athlete({ athleteId: 3, firstName: 'Carla', activeInjuries: 1 }),
        athlete({
          athleteId: 4,
          firstName: 'Dani',
          upcoming: 0,
          todayPlanned: 0,
          lastActivityAt: null,
        }),
      ],
      now,
    );
    expect(list.map(({ athlete }) => athlete.athleteId)).toEqual([3, 4, 2]);
  });
});

describe('byCompliance', () => {
  it('starts with the lowest and leaves athletes without due sessions last', () => {
    expect(
      byCompliance([
        athlete({ athleteId: 1, compliancePercent: null, due: 0 }),
        athlete({ athleteId: 2, compliancePercent: 90 }),
        athlete({ athleteId: 3, compliancePercent: 40 }),
      ]).map((row) => row.athleteId),
    ).toEqual([3, 2, 1]);
  });
});

describe('teamSummary', () => {
  it('adds up sessions across athletes', () => {
    expect(
      teamSummary([
        athlete({ due: 4, done: 3, todayPlanned: 1, todayDone: 1 }),
        athlete({ due: 2, done: 0, todayPlanned: 2, todayDone: 0 }),
      ]),
    ).toEqual({
      due: 6,
      done: 3,
      compliancePercent: 50,
      todayPlanned: 3,
      todayDone: 1,
    });
    expect(teamSummary([]).compliancePercent).toBeNull();
  });
});
