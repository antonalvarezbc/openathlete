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
    id: number;
    source: AiMemorySource;
    content: string;
    createdAt: string;
  }[];
}

/** Optimistic edit: original note text and summary version prevent lost updates. */
export const editAiMemorySchema = z
  .object({
    summary: z.string().trim().max(2000),
    summaryUpdatedAt: z.string().datetime().nullable(),
    notes: z
      .array(
        z
          .object({
            id: z.number().int().positive(),
            originalContent: z.string().max(300),
            content: z.string().trim().max(300),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.notes.map((note) => note.id)).size === value.notes.length,
    { message: 'Duplicate memory notes', path: ['notes'] },
  );
export type EditAiMemory = z.infer<typeof editAiMemorySchema>;
