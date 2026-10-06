-- This fork created both tables earlier, in
-- 20260926230000_add_coach_activity_chat_notices. Upstream's migration (#64)
-- creates the same tables with one difference: new-activity notices are off
-- by default. Applying the CREATE statements here would fail on the fork's
-- databases, so only that difference is applied. Existing settings rows keep
-- the choice they hold.
ALTER TABLE "public"."coach_activity_alert_settings"
  ALTER COLUMN "notify_new_activities" SET DEFAULT false;
