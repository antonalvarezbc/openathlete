import type {
  CoachOverviewAthleteDto,
  CoachOverviewSessionDto,
} from '@openathlete/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days back the overview can review. */
export const OVERVIEW_PERIODS = [7, 28] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

/** Days ahead checked for planned sessions. */
export const UPCOMING_DAYS = 7;
/** Without an activity for this many days, an athlete needs attention. */
export const INACTIVE_DAYS = 5;
/** Missed sessions this recent need attention whatever the compliance. */
export const RECENT_MISSED_DAYS = 3;
/** Below this compliance (with at least two due sessions) too. */
export const LOW_COMPLIANCE_PERCENT = 50;

const startOfDay = (date: Date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

/**
 * Local day boundaries for the API: the last `days` days, today, and the
 * next week, so "today" and "missed" follow the coach's time zone.
 */
export function overviewRange(days: OverviewPeriod, now = new Date()) {
  const today = startOfDay(now);
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  const until = new Date(today);
  until.setDate(until.getDate() + UPCOMING_DAYS + 1);
  return { from, today, until };
}

export type AttentionReason =
  | { kind: 'injury'; count: number }
  | { kind: 'missed'; count: number; sessions: CoachOverviewSessionDto[] }
  | { kind: 'low_compliance'; percent: number }
  | { kind: 'inactive'; days: number | null }
  | { kind: 'no_plan' }
  | { kind: 'unlinked'; count: number };

const SEVERITY: Record<AttentionReason['kind'], number> = {
  injury: 0,
  missed: 1,
  low_compliance: 2,
  inactive: 3,
  no_plan: 4,
  unlinked: 5,
};

/** What a coach should look at for this athlete, most serious first. */
export function attentionReasons(
  athlete: CoachOverviewAthleteDto,
  now = new Date(),
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const today = startOfDay(now);
  if (athlete.activeInjuries)
    reasons.push({ kind: 'injury', count: athlete.activeInjuries });
  const recent = athlete.missed.filter(
    (session) =>
      today.getTime() - new Date(session.startDate).getTime() <=
      RECENT_MISSED_DAYS * DAY_MS,
  );
  if (recent.length)
    reasons.push({ kind: 'missed', count: recent.length, sessions: recent });
  if (
    athlete.compliancePercent !== null &&
    athlete.due >= 2 &&
    athlete.compliancePercent < LOW_COMPLIANCE_PERCENT
  )
    reasons.push({
      kind: 'low_compliance',
      percent: athlete.compliancePercent,
    });
  const lastActivity = athlete.lastActivityAt
    ? startOfDay(new Date(athlete.lastActivityAt))
    : null;
  const idleDays = lastActivity
    ? Math.round((today.getTime() - lastActivity.getTime()) / DAY_MS)
    : null;
  if (idleDays === null || idleDays >= INACTIVE_DAYS)
    reasons.push({ kind: 'inactive', days: idleDays });
  if (!athlete.upcoming && !athlete.todayPlanned)
    reasons.push({ kind: 'no_plan' });
  if (athlete.unlinkedActivities)
    reasons.push({ kind: 'unlinked', count: athlete.unlinkedActivities });
  return reasons.sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind]);
}

const fullName = (athlete: CoachOverviewAthleteDto) =>
  [athlete.firstName, athlete.lastName].filter(Boolean).join(' ');

/**
 * Athletes with something to check, the most serious first; an unlinked
 * activity alone is only a hint and does not put an athlete here.
 */
export function needsAttention(
  athletes: CoachOverviewAthleteDto[],
  now = new Date(),
) {
  return athletes
    .map((athlete) => ({ athlete, reasons: attentionReasons(athlete, now) }))
    .filter(({ reasons }) => reasons.some((r) => r.kind !== 'unlinked'))
    .sort(
      (a, b) =>
        SEVERITY[a.reasons[0].kind] - SEVERITY[b.reasons[0].kind] ||
        b.reasons.length - a.reasons.length ||
        fullName(a.athlete).localeCompare(fullName(b.athlete)),
    );
}

/** Lowest compliance first; athletes without due sessions last. */
export function byCompliance(athletes: CoachOverviewAthleteDto[]) {
  return [...athletes].sort(
    (a, b) =>
      (a.compliancePercent ?? Infinity) - (b.compliancePercent ?? Infinity) ||
      fullName(a).localeCompare(fullName(b)),
  );
}

export function teamSummary(athletes: CoachOverviewAthleteDto[]) {
  const sum = (key: 'due' | 'done' | 'todayPlanned' | 'todayDone') =>
    athletes.reduce((total, athlete) => total + athlete[key], 0);
  const due = sum('due');
  const done = sum('done');
  return {
    due,
    done,
    compliancePercent: due ? Math.round((done / due) * 100) : null,
    todayPlanned: sum('todayPlanned'),
    todayDone: sum('todayDone'),
  };
}

export { fullName };
