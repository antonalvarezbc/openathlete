import { z } from 'zod';

const measure = z.number().finite().nullable();
const period = z.object({
  fromDate: z.string(),
  throughDate: z.string(),
  activities: z.number().int().nonnegative(),
  minutes: measure,
  distanceMeters: measure,
  elevationGainMeters: measure,
  meanRpe: measure,
  rpeAnswers: z.number().int().nonnegative(),
  loads: z.array(
    z.object({
      method: z.string(),
      total: z.number().finite(),
      activities: z.number().int().nonnegative(),
    }),
  ),
});
const comparison = z.object({
  planned: measure,
  actual: measure,
  changePercent: measure,
});

/** Descriptive evidence, not a readiness score or permission to increase training. */
export const planningEvidenceSchema = z.object({
  asOfDate: z.string(),
  windowDays: z.literal(42),
  historyTruncated: z.boolean(),
  lastActivityDate: z.string().nullable(),
  recent: period,
  previous: period,
  recovery: z.array(
    z.object({
      type: z.string(),
      unit: z.string(),
      latestDate: z.string().nullable(),
      latestValue: measure,
      ageDays: measure,
      recentDays: z.number().int().nonnegative(),
      baselineDays: z.number().int().nonnegative(),
      recentMean: measure,
      baselineMedian: measure,
      changePercent: measure,
      status: z.enum(['MISSING', 'STALE', 'INSUFFICIENT', 'AVAILABLE']),
    }),
  ),
  comparisons: z.array(
    z.object({
      date: z.string(),
      sport: z.string(),
      minutes: comparison,
      distanceMeters: comparison,
      elevationGainMeters: comparison,
      rpe: comparison,
    }),
  ),
  feedback: z.array(
    z.object({
      date: z.string(),
      rpe: measure,
      answers: z.array(z.object({ question: z.string(), answer: z.string() })),
    }),
  ),
  limitations: z.array(z.string()),
});
export type PlanningEvidence = z.infer<typeof planningEvidenceSchema>;
