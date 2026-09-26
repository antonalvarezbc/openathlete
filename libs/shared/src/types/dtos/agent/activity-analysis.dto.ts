import { z } from 'zod';

export const activityAnalysisRequestSchema = z
  .object({
    coachContext: z.string().trim().max(5000).default(''),
    language: z.enum(['es', 'en', 'fr', 'it']),
  })
  .strict();

const observations = z.array(z.string().trim().min(1).max(1000)).max(8);
export const activityAnalysisResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(3000),
    planComparison: z.string().trim().min(1).max(3000),
    highlights: observations,
    concerns: observations,
    nextSteps: observations,
    dataGaps: observations,
    athleteFeedback: z.string().trim().min(1).max(5000),
  })
  .strict();

export const updateActivityAnalysisSchema = z
  .object({ feedbackDraft: z.string().trim().min(1).max(5000) })
  .strict();

export type ActivityAnalysisRequest = z.infer<
  typeof activityAnalysisRequestSchema
>;
export type ActivityAnalysisResult = z.infer<
  typeof activityAnalysisResultSchema
>;
export type UpdateActivityAnalysis = z.infer<
  typeof updateActivityAnalysisSchema
>;

export interface SavedActivityAnalysis {
  activityAnalysisId: number;
  eventId: number;
  coachContext: string;
  language: ActivityAnalysisRequest['language'];
  analysis: ActivityAnalysisResult;
  feedbackDraft: string;
  contextSnapshot: Record<string, unknown>;
  model: string;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
}
