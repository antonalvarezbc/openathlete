import { METRIC_TYPE, planningEvidenceSchema } from '@openathlete/shared';

import { buildPlanningEvidence } from './planning-evidence';

const now = new Date('2030-10-21T12:00:00Z');
const date = (daysAgo: number) => new Date(Date.UTC(2030, 9, 21 - daysAgo));
const activity = (daysAgo: number, rpe: number | null = 0.7) => ({
  startDate: date(daysAgo),
  activity: {
    sport: 'TRAIL_RUNNING',
    movingTime: 8520,
    distance: 10000,
    elevationGain: 1050,
    rpe,
    relatedTraining: {
      goalDuration: 7200,
      goalDistance: 10000,
      goalElevationGain: 800,
      goalRpe: 0.5,
    },
    trainingLoadEntries: [
      { value: 100, calculation: { type: 'TRIMP' } },
      { value: 994, calculation: { type: 'FOSTER' } },
    ],
  },
});

describe('Planning evidence', () => {
  test('missing history stays unknown; zero RPE and zero measured load stay valid', () => {
    const empty = buildPlanningEvidence([], [], now);
    expect(empty.recent.minutes).toBeNull();
    expect(empty.recent.loads).toEqual([]);
    expect(empty.recovery.every((m) => m.status === 'MISSING')).toBe(true);
    expect(planningEvidenceSchema.safeParse(empty).success).toBe(true);
    const event = activity(1, 0);
    event.activity.trainingLoadEntries = [
      { value: 0, calculation: { type: 'TRIMP' } },
    ];
    const result = buildPlanningEvidence([event], [], now);
    expect(result.recent.meanRpe).toBe(0);
    expect(result.recent.loads[0].total).toBe(0);
  });

  test('compares actual with linked prescription and never adds different load methods', () => {
    const missingLoad = activity(2, null);
    missingLoad.activity.trainingLoadEntries = [];
    const result = buildPlanningEvidence(
      [activity(1), missingLoad, activity(8)],
      [],
      now,
    );
    expect(result.recent.activities).toBe(2);
    expect(result.previous.activities).toBe(1);
    expect(result.recent.rpeAnswers).toBe(1);
    expect(result.recent.loads).toEqual([
      { method: 'FOSTER', total: 994, activities: 1 },
      { method: 'TRIMP', total: 100, activities: 1 },
    ]);
    expect(result.comparisons[0].minutes).toEqual({
      planned: 120,
      actual: 142,
      changePercent: 18.33,
    });
    expect(result.comparisons[0].elevationGainMeters.changePercent).toBe(31.25);
    expect(result.comparisons[0].rpe).toEqual({
      planned: 5,
      actual: 7,
      changePercent: 40,
    });
  });

  test('uses a separate personal baseline and enough distinct dates, with freshness visible', () => {
    const metrics = [
      ...Array.from({ length: 10 }, (_, i) => ({
        type: METRIC_TYPE.HRV_LAST_NIGHT_AVG,
        value: 50,
        date: date(7 + i),
      })),
      ...[0, 1, 2].map((d) => ({
        type: METRIC_TYPE.HRV_LAST_NIGHT_AVG,
        value: 40,
        date: date(d),
      })),
      { type: METRIC_TYPE.HRV_LAST_NIGHT_AVG, value: 999, date: date(-1) },
      { type: METRIC_TYPE.SLEEP_DURATION, value: 6.5, date: date(4) },
    ];
    const result = buildPlanningEvidence([], metrics, now);
    expect(
      result.recovery.find((m) => m.type === METRIC_TYPE.HRV_LAST_NIGHT_AVG),
    ).toMatchObject({
      recentDays: 3,
      baselineDays: 10,
      recentMean: 40,
      baselineMedian: 50,
      changePercent: -20,
      status: 'AVAILABLE',
      ageDays: 0,
    });
    expect(
      result.recovery.find((m) => m.type === METRIC_TYPE.SLEEP_DURATION),
    ).toMatchObject({
      latestValue: 6.5,
      unit: 'h',
      status: 'STALE',
      ageDays: 4,
      changePercent: null,
    });
    const sparse = buildPlanningEvidence(
      [],
      metrics.filter((m) => m.date >= date(8)),
      now,
    );
    expect(sparse.recovery[0].status).toBe('INSUFFICIENT');
    expect(sparse.recovery[0].changePercent).toBeNull();
  });

  test('duplicate daily readings cannot manufacture sufficient baseline coverage', () => {
    const metrics = Array.from({ length: 12 }, () => ({
      type: METRIC_TYPE.HR_REST,
      date: date(8),
      value: 60,
    }));
    expect(
      buildPlanningEvidence([], metrics, now).recovery.find(
        (m) => m.type === METRIC_TYPE.HR_REST,
      )?.baselineDays,
    ).toBe(1);
  });

  test('excludes future/old activities and skipped answers; bounds feedback and comparisons', () => {
    const skipped = {
      ...activity(0),
      activity: {
        ...activity(0).activity,
        feedbackSkipped: true,
        feedbackQuestions: [
          { questionText: 'Private', answerText: 'Do not send' },
        ],
      },
    };
    const result = buildPlanningEvidence(
      [
        skipped,
        activity(-1),
        activity(42),
        ...Array.from({ length: 20 }, (_, i) => activity(i + 1)),
      ],
      [],
      now,
      true,
    );
    expect(result.historyTruncated).toBe(true);
    expect(result.comparisons).toHaveLength(10);
    expect(result.feedback).toHaveLength(5);
    expect(JSON.stringify(result)).not.toContain('Do not send');
    expect(result.recent.activities).toBe(7);
    expect(result.comparisons[0].date).toBe(date(0).toISOString());
  });

  test('zero prescription cannot produce an infinite percentage and same-day snapshots are stable', () => {
    const event = activity(1);
    event.activity.relatedTraining.goalElevationGain = 0;
    const first = buildPlanningEvidence([event], [], now);
    expect(first.comparisons[0].elevationGainMeters.changePercent).toBeNull();
    expect(first).toEqual(
      buildPlanningEvidence([event], [], new Date('2030-10-21T18:00:00Z')),
    );
    expect(first).not.toEqual(buildPlanningEvidence([event], [], date(-1)));
  });
});
