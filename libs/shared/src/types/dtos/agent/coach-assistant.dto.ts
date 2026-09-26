import { z } from 'zod';

import { planAdaptationRequestSchema } from './plan-adaptation.dto';

export const coachAssistantContextSchema = planAdaptationRequestSchema
  .pick({
    athleteId: true,
    planId: true,
    language: true,
    weekStart: true,
    timeZone: true,
  })
  .extend({ currentState: z.string().trim().max(3000).default('') })
  .strict();
export const coachAssistantChatSchema = coachAssistantContextSchema
  .extend({
    question: z.string().trim().min(1).max(3000),
    history: z
      .array(
        z
          .object({
            question: z.string().min(1).max(3000),
            answer: z.string().min(1).max(8000),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
export type CoachAssistantContextRequest = z.infer<
  typeof coachAssistantContextSchema
>;
export type CoachAssistantChatRequest = z.infer<
  typeof coachAssistantChatSchema
>;
