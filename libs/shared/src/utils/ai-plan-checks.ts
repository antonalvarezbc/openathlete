import {
  AiPlanCheckFacts,
  AiPlanIssue,
  AiPlanRules,
  DEFAULT_AI_PLAN_RULES,
  aiPlanDayOffset,
} from '../types/dtos/agent/ai-plan.dto';
import { SEOPlanData } from '../types/dtos/seo/seo-plan.dto';
import { METRIC_TYPE } from '../types/misc';

// The plan's rules (AI_PLAN_RULES) set the other limits.
/** The first week may exceed recent training by the growth %, plus 30 min. */
const FIRST_WEEK_SLACK_MINUTES = 30;
const INJURY_WEEKS = 2;
const MAX_SESSIONS_PER_DAY = 2;

/** Metrics a description may refer to, with the ones each mention needs. */
const METRIC_MENTIONS: Array<{ pattern: RegExp; anyOf: METRIC_TYPE[] }> = [
  {
    pattern: /\bftp\b|\bcp\b/i,
    anyOf: [
      METRIC_TYPE.FTP_CYCLING,
      METRIC_TYPE.FTP_RUNNING,
      METRIC_TYPE.CRITICAL_POWER_CYCLING,
      METRIC_TYPE.CRITICAL_POWER_RUNNING,
    ],
  },
  { pattern: /\b(vma|vam|mas|vvo2\s*max)\b/i, anyOf: [METRIC_TYPE.VMA] },
  {
    pattern: /\b(fc\s*m[aá]x|hr\s*max|fcm|fcr|hrr|reserva|reserve)\b/i,
    anyOf: [METRIC_TYPE.HR_MAX],
  },
  { pattern: /\b(fcr|hrr|reserva|reserve)\b/i, anyOf: [METRIC_TYPE.HR_REST] },
];

const ZONE_MENTION = /\b(?:z|zona|zone)\s*(\d)\b/gi;

/** Planned minutes of each week, in plan order. */
export function aiPlanWeekMinutes(plan: SEOPlanData): number[] {
  return plan.cycles.flatMap((cycle) =>
    cycle.weeks.map((week) =>
      Math.round(
        week.sessions.reduce(
          (sum, session) => sum + (session.goalDuration ?? 0),
          0,
        ) / 60,
      ),
    ),
  );
}

const highestBefore = (minutes: number[], index: number) =>
  Math.max(0, ...minutes.slice(Math.max(0, index - 3), index));

/**
 * Deterministic checks of an AI plan draft against the request, what is
 * known about the athlete and the plan's rules. The model is asked to fix
 * what they find once; the review dialog runs them again on every edit.
 */
export function checkAiPlan(
  plan: SEOPlanData,
  facts: AiPlanCheckFacts,
  rules: AiPlanRules = DEFAULT_AI_PLAN_RULES,
): AiPlanIssue[] {
  const growth = 1 + rules.growthPercent / 100;
  const recoveryRatio = 1 - rules.recoveryDropPercent / 100;
  const taperLastWeek = rules.taperLastWeekPercent / 100;
  const taperWeekBefore = rules.taperWeekBeforePercent / 100;
  const issues: AiPlanIssue[] = [];
  const weeks = plan.cycles.flatMap((cycle) => cycle.weeks);
  if (weeks.length !== facts.weeks)
    issues.push({
      code: 'WEEK_COUNT',
      value: weeks.length,
      limit: facts.weeks,
    });
  if (weeks.some((week, index) => week.weekNumber !== index + 1))
    issues.push({ code: 'WEEK_NUMBERS' });

  const startWeekday = new Date(`${facts.startDate}T00:00:00Z`).getUTCDay();
  const raceOffset = aiPlanDayOffset(facts.startDate, facts.raceDate);
  const zones = new Set(facts.zoneNumbers);
  const metrics = new Set(facts.metrics);

  weeks.forEach((week, index) => {
    const number = index + 1;
    const perDay = new Map<number, number>();
    for (const session of week.sessions) {
      const at = { week: number, session: session.name };
      if (!session.goalDuration)
        issues.push({ code: 'MISSING_DURATION', ...at });
      const offset = index * 7 + ((session.dayOfWeek - startWeekday + 7) % 7);
      if (offset >= raceOffset) issues.push({ code: 'AFTER_RACE', ...at });
      if (!facts.trainingDays.includes(session.dayOfWeek))
        issues.push({ code: 'DAY_NOT_AVAILABLE', ...at });
      if (!facts.sports.includes(session.sport))
        issues.push({ code: 'SPORT_NOT_ALLOWED', ...at });
      if (
        facts.injuries > 0 &&
        index < INJURY_WEEKS &&
        (session.goalRpe ?? 0) > rules.injuryMaxRpe
      )
        issues.push({
          code: 'INJURY_INTENSITY',
          ...at,
          value: session.goalRpe ?? 0,
          limit: rules.injuryMaxRpe,
        });
      const text = `${session.name} ${session.description}`;
      const unknownZone = [...text.matchAll(ZONE_MENTION)].some(
        (match) => !zones.has(Number(match[1])),
      );
      if (unknownZone) issues.push({ code: 'UNKNOWN_ZONE', ...at });
      if (
        METRIC_MENTIONS.some(
          ({ pattern, anyOf }) =>
            pattern.test(text) && !anyOf.some((type) => metrics.has(type)),
        )
      )
        issues.push({ code: 'UNKNOWN_METRIC', ...at });
      perDay.set(session.dayOfWeek, (perDay.get(session.dayOfWeek) ?? 0) + 1);
    }
    const busiest = Math.max(0, ...perDay.values());
    if (busiest > MAX_SESSIONS_PER_DAY)
      issues.push({
        code: 'TOO_MANY_SESSIONS',
        week: number,
        value: busiest,
        limit: MAX_SESSIONS_PER_DAY,
      });
  });

  const minutes = aiPlanWeekMinutes(plan);
  const maxMinutes = Math.round(
    facts.weeklyHours * 60 * (1 + rules.hoursAllowancePercent / 100),
  );
  minutes.forEach((value, index) => {
    if (value > maxMinutes)
      issues.push({
        code: 'WEEK_TOO_LONG',
        week: index + 1,
        value,
        limit: maxMinutes,
      });
    if (index === 0) return;
    const before = highestBefore(minutes, index);
    const limit = Math.round(before * growth + rules.growthMinutes);
    if (before > 0 && value > limit)
      issues.push({ code: 'PROGRESSION', week: index + 1, value, limit });
  });
  if (facts.recentWeeklyMinutes != null && minutes.length) {
    const limit = Math.round(
      facts.recentWeeklyMinutes * growth + FIRST_WEEK_SLACK_MINUTES,
    );
    if (minutes[0] > limit)
      issues.push({ code: 'FIRST_WEEK', week: 1, value: minutes[0], limit });
  }

  // Recovery: a limited number of loading weeks in a row, before the taper.
  if (minutes.length >= rules.maxLoadingWeeks + 2) {
    let loading = 1;
    for (let index = 1; index < minutes.length - 2; index++) {
      const recovery =
        minutes[index] <= highestBefore(minutes, index) * recoveryRatio;
      loading = recovery ? 0 : loading + 1;
      if (loading === rules.maxLoadingWeeks + 1)
        issues.push({
          code: 'NO_RECOVERY',
          week: index + 1,
          limit: rules.maxLoadingWeeks,
        });
    }
  }

  // Taper: the race week, and for longer plans the week before, go down.
  if (minutes.length >= 4) {
    const peak = Math.max(...minutes);
    const last = minutes.length - 1;
    if (minutes[last] > peak * taperLastWeek)
      issues.push({
        code: 'NO_TAPER',
        week: last + 1,
        value: minutes[last],
        limit: Math.round(peak * taperLastWeek),
      });
    if (minutes.length >= 8 && minutes[last - 1] > peak * taperWeekBefore)
      issues.push({
        code: 'NO_TAPER',
        week: last,
        value: minutes[last - 1],
        limit: Math.round(peak * taperWeekBefore),
      });
  }
  return issues;
}
