-- CreateEnum
CREATE TYPE "public"."ai_key_source" AS ENUM ('OWN_KEY', 'HOSTED');

-- CreateTable
CREATE TABLE "public"."ai_usage" (
    "ai_usage_id" SERIAL NOT NULL,
    "month" DATE NOT NULL,
    "task" "public"."ai_task" NOT NULL,
    "source" "public"."ai_key_source" NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("ai_usage_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_user_id_month_task_source_key" ON "public"."ai_usage"("user_id", "month", "task", "source");

-- AddForeignKey
ALTER TABLE "public"."ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

