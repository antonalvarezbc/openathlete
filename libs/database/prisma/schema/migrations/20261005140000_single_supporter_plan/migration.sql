-- One paid plan, Supporter, replaces the athlete, coach and club plans.
-- Any remaining paid subscription becomes Supporter, so no row is lost.

-- CreateEnum
CREATE TYPE "public"."billing_interval" AS ENUM ('month', 'year');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."subscription_plan_new" AS ENUM ('FREE', 'SUPPORTER');
ALTER TABLE "public"."subscription" ALTER COLUMN "plan" TYPE "public"."subscription_plan_new" USING (
  CASE WHEN "plan"::text = 'FREE' THEN 'FREE' ELSE 'SUPPORTER' END
)::"public"."subscription_plan_new";
ALTER TYPE "public"."subscription_plan" RENAME TO "subscription_plan_old";
ALTER TYPE "public"."subscription_plan_new" RENAME TO "subscription_plan";
DROP TYPE "public"."subscription_plan_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."subscription" ADD COLUMN     "billing_interval" "public"."billing_interval";
