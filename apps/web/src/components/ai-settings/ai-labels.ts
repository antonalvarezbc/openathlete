import { m } from '@/paraglide/messages';

import { AiProvider, AiTask } from '@openathlete/shared';

export function aiTaskLabel(task: AiTask): string {
  switch (task) {
    case AiTask.DEFAULT:
      return m.ai_task_default();
    case AiTask.EVENT_GENERATION:
      return m.ai_task_event_generation();
    case AiTask.EVENT_MODIFICATION:
      return m.ai_task_event_modification();
    case AiTask.POST_ACTIVITY_QUESTIONS:
      return m.ai_task_post_activity_questions();
    case AiTask.FEEDBACK_EXTRACTION:
      return m.ai_task_feedback_extraction();
    case AiTask.TRAINING_LOAD_ESTIMATION:
      return m.ai_task_training_load_estimation();
    case AiTask.PLAN_GENERATION:
      return m.ai_task_plan_generation();
    case AiTask.PLAN_ADAPTATION:
      return m.ai_task_plan_adaptation();
    case AiTask.ACTIVITY_ANALYSIS:
      return m.ai_task_activity_analysis();
    case AiTask.WORKOUT_PARSER:
      return m.ai_task_workout_parser();
    case AiTask.AI_MEMORY:
      return m.ai_task_ai_memory();
  }
}

/** What a task is used for, to help choose its model. */
export function aiTaskDescription(task: AiTask): string {
  switch (task) {
    case AiTask.DEFAULT:
      return m.ai_task_default_description();
    case AiTask.EVENT_GENERATION:
      return m.ai_task_event_generation_description();
    case AiTask.EVENT_MODIFICATION:
      return m.ai_task_event_modification_description();
    case AiTask.POST_ACTIVITY_QUESTIONS:
      return m.ai_task_post_activity_questions_description();
    case AiTask.FEEDBACK_EXTRACTION:
      return m.ai_task_feedback_extraction_description();
    case AiTask.TRAINING_LOAD_ESTIMATION:
      return m.ai_task_training_load_estimation_description();
    case AiTask.PLAN_GENERATION:
      return m.ai_task_plan_generation_description();
    case AiTask.PLAN_ADAPTATION:
      return m.ai_task_plan_adaptation_description();
    case AiTask.ACTIVITY_ANALYSIS:
      return m.ai_task_activity_analysis_description();
    case AiTask.WORKOUT_PARSER:
      return m.ai_task_workout_parser_description();
    case AiTask.AI_MEMORY:
      return m.ai_task_ai_memory_description();
  }
}

/** Display name of a provider id, falling back to the id itself. */
export function aiProviderName(
  providers: AiProvider[] | undefined,
  providerId: string,
): string {
  return providers?.find((item) => item.id === providerId)?.name ?? providerId;
}
