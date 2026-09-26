CREATE TYPE "plan_race_priority" AS ENUM ('TARGET', 'PREPARATORY');
CREATE TABLE "training_plan_race" (
  "training_plan_id" INTEGER NOT NULL,
  "event_competition_id" INTEGER NOT NULL,
  "priority" "plan_race_priority" NOT NULL,
  CONSTRAINT "training_plan_race_pkey" PRIMARY KEY ("training_plan_id", "event_competition_id"),
  CONSTRAINT "training_plan_race_training_plan_id_fkey" FOREIGN KEY ("training_plan_id") REFERENCES "training_plan"("training_plan_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_plan_race_event_competition_id_fkey" FOREIGN KEY ("event_competition_id") REFERENCES "event_competition"("event_competition_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "training_plan_race_event_competition_id_idx" ON "training_plan_race"("event_competition_id");
-- Prisma cannot express this partial index: each plan has at most one target race.
CREATE UNIQUE INDEX "training_plan_race_one_target_idx" ON "training_plan_race"("training_plan_id") WHERE "priority" = 'TARGET';
