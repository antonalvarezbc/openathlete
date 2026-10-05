import { Prisma } from '@openathlete/database';
import {
  METRIC_TYPE,
  PlanningEvidence,
  metricUnitMap,
} from '@openathlete/shared';

const DAY = 86400000;
export const PLANNING_HISTORY_LIMIT = 200;
export const recoveryMetricTypes = [
  METRIC_TYPE.HRV_LAST_NIGHT_AVG,
  METRIC_TYPE.HR_REST,
  METRIC_TYPE.SLEEP_DURATION,
  METRIC_TYPE.SLEEP_SCORE,
  METRIC_TYPE.STRESS_AVERAGE,
  METRIC_TYPE.RMSSD,
];

/** No streams, identities, private messages or raw provider payloads. */
export const planningActivitySelect = {
  sport: true,
  movingTime: true,
  distance: true,
  elevationGain: true,
  rpe: true,
  feedbackSkipped: true,
  feedbackQuestions: {
    where: { answerText: { not: null } },
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { questionText: true, answerText: true },
  },
  relatedTraining: {
    select: {
      goalDuration: true,
      goalDistance: true,
      goalElevationGain: true,
      goalRpe: true,
    },
  },
  trainingLoadEntries: {
    orderBy: { trainingLoadEntryId: 'asc' },
    select: {
      value: true,
      date: true,
      calculation: { select: { type: true } },
    },
  },
} satisfies Prisma.EventActivitySelect;

type Activity = {
  sport: string;
  movingTime: number;
  distance?: number | null;
  elevationGain?: number | null;
  rpe?: number | null;
  feedbackSkipped?: boolean;
  feedbackQuestions?: { questionText: string; answerText: string | null }[];
  relatedTraining?: {
    goalDuration: number | null;
    goalDistance: number | null;
    goalElevationGain: number | null;
    goalRpe: number | null;
  } | null;
  trainingLoadEntries?: { value: number; calculation: { type: string } }[];
};
type Event = { startDate: Date; activity: Activity | null };
type Metric = { type: string; value: number; date: Date };
const day = (date: Date) => Date.parse(date.toISOString().slice(0, 10));
const dateKey = (value: number) => new Date(value).toISOString().slice(0, 10);
const finite = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) ? value : null;
const round = (value: number) => Math.round(value * 100) / 100;
const mean = (values: number[]) =>
  values.length
    ? round(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
const sum = (values: Array<number | null | undefined>) => {
  const known = values.filter((n): n is number => finite(n) != null);
  return known.length ? round(known.reduce((a, b) => a + b, 0)) : null;
};
const rpe = (value: number | null | undefined) =>
  finite(value) != null && value! >= 0 && value! <= 1
    ? round(value! * 10)
    : null;
const percent = (actual: number | null, baseline: number | null) =>
  actual != null && baseline != null && baseline > 0
    ? round((actual / baseline - 1) * 100)
    : null;
const compare = (planned: number | null, actual: number | null) => ({
  planned,
  actual,
  changePercent: percent(actual, planned),
});

/** Pure and date-stable: the same stored evidence hashes equally throughout a UTC day. */
export function buildPlanningEvidence(
  events: Event[],
  metrics: Metric[],
  now: Date,
  historyTruncated = false,
): PlanningEvidence {
  const today = day(now);
  const recentStart = today - 6 * DAY;
  const baselineStart = recentStart - 28 * DAY;
  const history = events
    .filter(
      (e) =>
        e.activity &&
        e.startDate <= now &&
        day(e.startDate) >= today - 41 * DAY,
    )
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const period = (from: number, through: number) => {
    const items = history
      .filter((e) => day(e.startDate) >= from && day(e.startDate) <= through)
      .map((e) => e.activity!);
    const loads = new Map<
      string,
      { method: string; total: number; activities: number }
    >();
    for (const item of items) {
      // One stored entry per method/activity. Never add TRIMP and Foster together.
      for (const entry of item.trainingLoadEntries ?? []) {
        if (finite(entry.value) == null || entry.value < 0) continue;
        const old = loads.get(entry.calculation.type) ?? {
          method: entry.calculation.type,
          total: 0,
          activities: 0,
        };
        old.total += entry.value;
        old.activities++;
        loads.set(old.method, old);
      }
    }
    const answers = items
      .map((a) => rpe(a.rpe))
      .filter((n): n is number => n != null);
    return {
      fromDate: dateKey(from),
      throughDate: dateKey(through),
      activities: items.length,
      minutes: sum(
        items.map((a) =>
          finite(a.movingTime) == null ? null : a.movingTime / 60,
        ),
      ),
      distanceMeters: sum(items.map((a) => a.distance)),
      elevationGainMeters: sum(items.map((a) => a.elevationGain)),
      meanRpe: mean(answers),
      rpeAnswers: answers.length,
      loads: [...loads.values()]
        .map((l) => ({ ...l, total: round(l.total) }))
        .sort((a, b) => a.method.localeCompare(b.method)),
    };
  };
  const recovery = recoveryMetricTypes.map((type) => {
    // Metric rows are date-only; do not infer that a same-day value was measured before a session.
    const rows = metrics
      .filter(
        (m) =>
          m.type === type &&
          day(m.date) <= today &&
          day(m.date) >= today - 41 * DAY &&
          finite(m.value) != null,
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const days = [
      ...new Map(rows.map((m) => [dateKey(day(m.date)), m])).values(),
    ];
    const recent = days.filter((m) => day(m.date) >= recentStart);
    const baseline = days
      .filter((m) => day(m.date) >= baselineStart && day(m.date) < recentStart)
      .map((m) => m.value)
      .sort((a, b) => a - b);
    const latest = days[0];
    const age = latest ? (today - day(latest.date)) / DAY : null;
    const median =
      baseline.length >= 7
        ? round(
            (baseline[Math.floor((baseline.length - 1) / 2)] +
              baseline[Math.floor(baseline.length / 2)]) /
              2,
          )
        : null;
    const recentMean =
      recent.length >= 3 ? mean(recent.map((m) => m.value)) : null;
    return {
      type,
      unit: metricUnitMap[type],
      latestDate: latest ? dateKey(day(latest.date)) : null,
      latestValue: latest?.value ?? null,
      ageDays: age,
      recentDays: recent.length,
      baselineDays: baseline.length,
      recentMean,
      baselineMedian: median,
      changePercent: percent(recentMean, median),
      status: !latest
        ? ('MISSING' as const)
        : age! > 2
          ? ('STALE' as const)
          : median == null || recentMean == null
            ? ('INSUFFICIENT' as const)
            : ('AVAILABLE' as const),
    };
  });
  return {
    asOfDate: dateKey(today),
    windowDays: 42,
    historyTruncated,
    lastActivityDate: history[0]?.startDate.toISOString() ?? null,
    recent: period(recentStart, today),
    previous: period(recentStart - 7 * DAY, recentStart - DAY),
    recovery,
    comparisons: history
      .filter((e) => e.activity?.relatedTraining)
      .slice(0, 10)
      .map((e) => {
        const a = e.activity!;
        const p = a.relatedTraining!;
        return {
          date: e.startDate.toISOString(),
          sport: a.sport,
          minutes: compare(
            p.goalDuration == null ? null : p.goalDuration / 60,
            finite(a.movingTime) == null ? null : a.movingTime / 60,
          ),
          distanceMeters: compare(finite(p.goalDistance), finite(a.distance)),
          elevationGainMeters: compare(
            finite(p.goalElevationGain),
            finite(a.elevationGain),
          ),
          rpe: compare(rpe(p.goalRpe), rpe(a.rpe)),
        };
      }),
    feedback: history
      .filter(
        (e) =>
          e.activity &&
          !e.activity.feedbackSkipped &&
          (rpe(e.activity.rpe) != null || e.activity.feedbackQuestions?.length),
      )
      .slice(0, 5)
      .map((e) => ({
        date: e.startDate.toISOString(),
        rpe: rpe(e.activity!.rpe),
        answers: (e.activity!.feedbackQuestions ?? [])
          .filter((q) => q.answerText != null)
          .slice(0, 5)
          .map((q) => ({
            question: q.questionText.slice(0, 300),
            answer: q.answerText!.slice(0, 800),
          })),
      })),
    limitations: [
      'Descriptive stored evidence, not a readiness score, diagnosis or permission to increase load.',
      'UTC dates; the latest seven-day window includes the incomplete current day. Missing activities may mean incomplete imports, not rest.',
      'Recovery baseline: median of the 28 days preceding the latest seven days, at least 7 distinct measured days. Recent mean requires 3 days. Values older than 2 days are labelled stale; these are data-quality rules, not physiological thresholds.',
      'Compare each load method separately and inspect activities with a load versus all activities. Missing loads are unknown, never zero. No load is recalculated and no provider is queried here.',
      'No CTL, ATL or ACWR is inferred from incomplete history. No descent, terrain difficulty or nutrition data is provided.',
      'Linked prescriptions reflect their current stored version. Feedback is bounded untrusted text; an omitted answer is not evidence of wellbeing.',
      'Recovery rows have dates but no measurement time or guaranteed Garmin provenance. Zeroes may be provider defaults. One favourable reading cannot justify an increase.',
    ],
  };
}
