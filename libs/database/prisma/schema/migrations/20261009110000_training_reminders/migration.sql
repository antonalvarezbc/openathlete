-- Push reminders the evening before planned sessions, at the user's local time
ALTER TABLE "user" ADD COLUMN "time_zone" TEXT,
ADD COLUMN "training_reminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "training_reminder_sent_on" DATE;
