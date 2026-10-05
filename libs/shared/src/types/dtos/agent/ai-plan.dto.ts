import { z } from 'zod';

import { METRIC_TYPE, SPORT_TYPE } from '../../misc';
import { CreateWorkoutStepDto } from '../core/workout.dto';
import { SEOPlanData } from '../seo/seo-plan.dto';

/** Plans longer than this are built in several blocks. */
export const AI_PLAN_MAX_WEEKS = 24;
export const AI_PLAN_MIN_WEEKS = 2;
/** Sessions sent in one request to structure a week. */
export const AI_PLAN_MAX_WEEK_SESSIONS = 14;
export const AI_PLAN_METHODOLOGIES = [
  'POLARIZED',
  'PYRAMIDAL',
  'THRESHOLD',
] as const;
export type AiPlanMethodology = (typeof AI_PLAN_METHODOLOGIES)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Invalid calendar date');

const timeZone = z.string().refine((value) => {
  try {
    return (
      new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions()
        .timeZone.length > 0
    );
  } catch {
    return false;
  }
}, 'Invalid time zone');

const dayIndex = (date: string) =>
  Math.round(new Date(`${date}T00:00:00Z`).getTime() / 86400000);

/** Days from the plan's first day to `date` (both civil dates). */
export const aiPlanDayOffset = (startDate: string, date: string) =>
  dayIndex(date) - dayIndex(startDate);

/**
 * Weeks from the start date to the race: the plan's weeks start on the
 * start date's weekday, and the race falls in the last one.
 */
export const aiPlanWeekCount = (startDate: string, raceDate: string) =>
  Math.floor(aiPlanDayOffset(startDate, raceDate) / 7) + 1;

const uniqueDays = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, 'Repeated day');

export const aiPlanRequestSchema = z
  .object({
    athleteId: z.number().int().positive(),
    goal: z
      .object({
        name: z.string().trim().min(1).max(100),
        /** Race day, in the athlete's calendar */
        date: isoDate,
        sport: z.nativeEnum(SPORT_TYPE),
        distanceKm: z.number().positive().max(1000).nullable().optional(),
        elevationGain: z
          .number()
          .nonnegative()
          .max(20000)
          .nullable()
          .optional(),
        /** Target time in seconds */
        timeTarget: z
          .number()
          .int()
          .positive()
          .max(7 * 86400)
          .nullable()
          .optional(),
      })
      .strict(),
    startDate: isoDate,
    timeZone,
    sports: z
      .array(z.nativeEnum(SPORT_TYPE))
      .min(1)
      .max(5)
      .refine((list) => new Set(list).size === list.length, 'Repeated sport'),
    /** 0 = Sunday, as in plan files */
    trainingDays: uniqueDays,
    weeklyHours: z.number().positive().max(40),
    longSessionDay: z.number().int().min(0).max(6).nullable().optional(),
    methodology: z.enum(AI_PLAN_METHODOLOGIES).nullable().optional(),
    methodologyNotes: z.string().trim().max(800).optional(),
    constraints: z.string().trim().max(1500).optional(),
    language: z.enum(['es', 'en', 'fr', 'it']),
  })
  .strict()
  .superRefine((request, ctx) => {
    const weeks = aiPlanWeekCount(request.startDate, request.goal.date);
    if (aiPlanDayOffset(request.startDate, request.goal.date) < 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['goal', 'date'],
        message: 'AI_PLAN_RACE_BEFORE_START',
      });
    else if (weeks < AI_PLAN_MIN_WEEKS || weeks > AI_PLAN_MAX_WEEKS)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['goal', 'date'],
        message: 'AI_PLAN_LENGTH',
      });
    if (!request.sports.includes(request.goal.sport))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sports'],
        message: 'AI_PLAN_GOAL_SPORT',
      });
    if (
      request.longSessionDay != null &&
      !request.trainingDays.includes(request.longSessionDay)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['longSessionDay'],
        message: 'AI_PLAN_LONG_DAY',
      });
  });

export type AiPlanRequest = z.infer<typeof aiPlanRequestSchema>;

/**
 * What the checks need to know about the request and the athlete. The API
 * sends them with the draft, so the review dialog checks edits the same way.
 */
export interface AiPlanCheckFacts {
  startDate: string;
  raceDate: string;
  weeks: number;
  sports: SPORT_TYPE[];
  trainingDays: number[];
  weeklyHours: number;
  /** Unresolved injuries */
  injuries: number;
  /** Numbers in the names of the athlete's zones ("Zone 2" → 2) */
  zoneNumbers: number[];
  metrics: METRIC_TYPE[];
  /** Average of the last four weeks, null without recent activities */
  recentWeeklyMinutes: number | null;
}

export const AI_PLAN_ISSUE_CODES = [
  'WEEK_COUNT',
  'WEEK_NUMBERS',
  'MISSING_DURATION',
  'AFTER_RACE',
  'DAY_NOT_AVAILABLE',
  'TOO_MANY_SESSIONS',
  'SPORT_NOT_ALLOWED',
  'WEEK_TOO_LONG',
  'FIRST_WEEK',
  'PROGRESSION',
  'NO_RECOVERY',
  'NO_TAPER',
  'INJURY_INTENSITY',
  'UNKNOWN_ZONE',
  'UNKNOWN_METRIC',
] as const;
export type AiPlanIssueCode = (typeof AI_PLAN_ISSUE_CODES)[number];

export interface AiPlanIssue {
  code: AiPlanIssueCode;
  /** Plan week, from 1 */
  week?: number;
  session?: string;
  /** Minutes, sessions or RPE, depending on the code */
  value?: number;
  limit?: number;
}

export interface AiPlanConflicts {
  /** Upcoming training sessions already in the plan's dates */
  sessions: number;
  plans: Array<{
    trainingPlanId: number;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
}

/**
 * Limits the checks apply to a plan. The AI may change them when the coach's
 * methodology or notes ask for it, and the coach may edit them in the review;
 * both always within the safety bounds below.
 */
export const AI_PLAN_RULES = {
  /** A week may grow this % over the highest of the three before... */
  growthPercent: { default: 10, min: 5, max: 20 },
  /** ...plus these minutes */
  growthMinutes: { default: 15, min: 0, max: 30 },
  /** Loading weeks in a row before a recovery week */
  maxLoadingWeeks: { default: 4, min: 2, max: 6 },
  /** A recovery week is at least this % below the three weeks before */
  recoveryDropPercent: { default: 15, min: 10, max: 40 },
  /** The race week at most this % of the peak week */
  taperLastWeekPercent: { default: 70, min: 40, max: 85 },
  /** The week before the race week (plans of 8+ weeks) at most this % */
  taperWeekBeforePercent: { default: 90, min: 60, max: 100 },
  /** Weekly minutes may exceed the requested hours by this % */
  hoursAllowancePercent: { default: 10, min: 0, max: 20 },
  /** Highest session RPE in weeks 1 and 2 with unresolved injuries */
  injuryMaxRpe: { default: 6, min: 3, max: 7 },
} as const;

export type AiPlanRuleKey = keyof typeof AI_PLAN_RULES;
export const AI_PLAN_RULE_KEYS = Object.keys(AI_PLAN_RULES) as AiPlanRuleKey[];
export type AiPlanRules = Record<AiPlanRuleKey, number>;

export const DEFAULT_AI_PLAN_RULES = Object.fromEntries(
  AI_PLAN_RULE_KEYS.map((key) => [key, AI_PLAN_RULES[key].default]),
) as AiPlanRules;

/** Where a rule in effect comes from. */
export interface AiPlanRuleNote {
  rule: AiPlanRuleKey;
  source: 'default' | 'ai' | 'coach';
  /** The AI's one-line reason, when it set the rule */
  reason?: string;
  /** The value asked for, when it was outside the bounds */
  requested?: number;
}

/**
 * Applies requested rule values: whole numbers within the safety bounds.
 * Anything outside them is clamped and reported in the note, never silently.
 */
export function applyAiPlanRules(
  requested: Array<{ rule: string; value: number; reason?: string }>,
  base: AiPlanRules = DEFAULT_AI_PLAN_RULES,
  source: 'ai' | 'coach' = 'ai',
): { rules: AiPlanRules; notes: AiPlanRuleNote[] } {
  const rules = { ...base };
  const notes = new Map<AiPlanRuleKey, AiPlanRuleNote>();
  for (const item of requested) {
    if (!(AI_PLAN_RULE_KEYS as string[]).includes(item.rule)) continue;
    const rule = item.rule as AiPlanRuleKey;
    const { min, max } = AI_PLAN_RULES[rule];
    const value = Number.isFinite(item.value)
      ? Math.round(item.value)
      : AI_PLAN_RULES[rule].default;
    const applied = Math.min(max, Math.max(min, value));
    rules[rule] = applied;
    notes.set(rule, {
      rule,
      source,
      ...(item.reason?.trim()
        ? { reason: item.reason.trim().slice(0, 200) }
        : {}),
      ...(applied !== item.value ? { requested: item.value } : {}),
    });
  }
  return {
    rules,
    notes: AI_PLAN_RULE_KEYS.map(
      (rule) => notes.get(rule) ?? { rule, source: 'default' as const },
    ),
  };
}

export interface AiPlanDraft {
  /** In the plan import format; null when the model failed twice */
  plan: SEOPlanData | null;
  issues: AiPlanIssue[];
  facts: AiPlanCheckFacts;
  /** The limits the checks used, and where each comes from */
  rules: AiPlanRules;
  ruleNotes: AiPlanRuleNote[];
  conflicts: AiPlanConflicts;
}

export interface AiPlanJobStatus {
  jobId: string;
  state: 'queued' | 'running' | 'done' | 'failed';
  /** The repair round runs when the automatic checks find problems. */
  stage?: 'generating' | 'repairing';
  draft?: AiPlanDraft;
}

export const aiPlanWeekStepsRequestSchema = z
  .object({
    athleteId: z.number().int().positive(),
    sessions: z
      .array(
        z
          .object({
            sport: z.nativeEnum(SPORT_TYPE),
            text: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(AI_PLAN_MAX_WEEK_SESSIONS),
  })
  .strict();

export type AiPlanWeekStepsRequest = z.infer<
  typeof aiPlanWeekStepsRequestSchema
>;

export interface AiPlanWeekSteps {
  /** One entry per session, null when it could not be structured */
  steps: Array<CreateWorkoutStepDto[] | null>;
}
