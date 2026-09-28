-- Existing targets remain unchanged; new templates retain a portable zone identity.
ALTER TABLE "workout_step_target" ADD COLUMN "zone_reference" JSONB;
