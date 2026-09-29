import { z } from 'zod';

export const aiMemoryModeSchema = z.enum(['OFF', 'COMPACT', 'EXTENDED']);
export type AiMemoryMode = z.infer<typeof aiMemoryModeSchema>;

export const aiMemorySourceSchema = z.enum([
  'ACTIVITY_ANALYSIS',
  'PLAN_ADAPTATION',
  'COACH_ASSISTANT',
  'EVENT_GENERATION',
  'EVENT_MODIFICATION',
]);
export type AiMemorySource = z.infer<typeof aiMemorySourceSchema>;

export const updateAiMemorySettingsSchema = z
  .object({ mode: aiMemoryModeSchema })
  .strict();
export type UpdateAiMemorySettings = z.infer<
  typeof updateAiMemorySettingsSchema
>;

/** Private AI memory of one coach about one athlete, as the coach sees it. */
export interface AiMemoryDto {
  mode: AiMemoryMode;
  summary: string;
  summaryUpdatedAt: string | null;
  notes: {
    source: AiMemorySource;
    content: string;
    createdAt: string;
  }[];
}
