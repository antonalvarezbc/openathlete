-- CreateTable
CREATE TABLE "public"."manual_garmin_workout_export" (
    "manual_garmin_workout_export_id" SERIAL NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "garmin_user_profile_id" TEXT NOT NULL,
    "garmin_workout_id" TEXT NOT NULL,
    "garmin_schedule_id" TEXT NOT NULL,
    "planned_date" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "event_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_garmin_workout_export_pkey" PRIMARY KEY ("manual_garmin_workout_export_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_garmin_workout_export_event_id_key" ON "public"."manual_garmin_workout_export"("event_id");

-- CreateIndex
CREATE INDEX "manual_garmin_workout_export_athlete_id_idx" ON "public"."manual_garmin_workout_export"("athlete_id");

-- AddForeignKey
ALTER TABLE "public"."manual_garmin_workout_export" ADD CONSTRAINT "manual_garmin_workout_export_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

