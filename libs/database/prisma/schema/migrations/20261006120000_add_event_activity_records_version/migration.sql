-- Records computed before this version used a search that missed distances
-- on sparse recordings: every activity is recomputed in the background
ALTER TABLE "public"."event_activity" ADD COLUMN "records_version" INTEGER NOT NULL DEFAULT 0;
