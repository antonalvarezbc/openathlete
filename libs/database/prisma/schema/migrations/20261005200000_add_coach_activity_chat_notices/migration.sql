-- CreateTable
CREATE TABLE "public"."coach_activity_alert_settings" (
    "id" SERIAL NOT NULL,
    "coach_user_id" INTEGER NOT NULL,
    "athlete_id" INTEGER NOT NULL,
    "notify_comments" BOOLEAN NOT NULL DEFAULT true,
    "notify_rpe" BOOLEAN NOT NULL DEFAULT true,
    "notify_new_activities" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "coach_activity_alert_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."activity_chat_notice" (
    "id" SERIAL NOT NULL,
    "coach_user_id" INTEGER NOT NULL,
    "delivery_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "rpe" DOUBLE PRECISION,
    "event_id" INTEGER,
    "message_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_chat_notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coach_activity_alert_settings_athlete_id_idx" ON "public"."coach_activity_alert_settings"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "coach_activity_alert_settings_coach_user_id_athlete_id_key" ON "public"."coach_activity_alert_settings"("coach_user_id", "athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_chat_notice_message_id_key" ON "public"."activity_chat_notice"("message_id");

-- CreateIndex
CREATE INDEX "activity_chat_notice_event_id_idx" ON "public"."activity_chat_notice"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_chat_notice_coach_user_id_delivery_key_key" ON "public"."activity_chat_notice"("coach_user_id", "delivery_key");

-- AddForeignKey
ALTER TABLE "public"."coach_activity_alert_settings" ADD CONSTRAINT "coach_activity_alert_settings_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "public"."user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coach_activity_alert_settings" ADD CONSTRAINT "coach_activity_alert_settings_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athlete"("athlete_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_chat_notice" ADD CONSTRAINT "activity_chat_notice_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "public"."user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_chat_notice" ADD CONSTRAINT "activity_chat_notice_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."event"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activity_chat_notice" ADD CONSTRAINT "activity_chat_notice_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."message"("message_id") ON DELETE SET NULL ON UPDATE CASCADE;
