-- When the AI last read the post-activity answers, so the app can tell
-- "still reading" from "nothing to report"
ALTER TABLE "event_activity" ADD COLUMN "feedback_analyzed_at" TIMESTAMP(3);
