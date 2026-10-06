-- Lets athletes mark an activity as a race
ALTER TABLE "public"."event_activity" ADD COLUMN "is_race" BOOLEAN NOT NULL DEFAULT false;
