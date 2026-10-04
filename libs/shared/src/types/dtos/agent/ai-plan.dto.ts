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

export interface AiPlanDraft {
  /** In the plan import format; null when the model failed twice */
  plan: SEOPlanData | null;
  issues: AiPlanIssue[];
  facts: AiPlanCheckFacts;
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
