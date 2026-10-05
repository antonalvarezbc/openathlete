-- AI tasks of the coach features (plan drafts, adaptation and assistant,
-- activity analysis, written workouts, memory), so users can run them on
-- their own keys and choose their models. Additive only.
ALTER TYPE "public"."ai_task" ADD VALUE 'PLAN_GENERATION';
ALTER TYPE "public"."ai_task" ADD VALUE 'PLAN_ADAPTATION';
ALTER TYPE "public"."ai_task" ADD VALUE 'ACTIVITY_ANALYSIS';
ALTER TYPE "public"."ai_task" ADD VALUE 'WORKOUT_PARSER';
ALTER TYPE "public"."ai_task" ADD VALUE 'AI_MEMORY';
