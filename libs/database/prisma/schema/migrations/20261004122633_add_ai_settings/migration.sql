-- CreateEnum
CREATE TYPE "public"."ai_task" AS ENUM ('DEFAULT', 'EVENT_GENERATION', 'EVENT_MODIFICATION', 'POST_ACTIVITY_QUESTIONS', 'FEEDBACK_EXTRACTION', 'TRAINING_LOAD_ESTIMATION');

-- CreateTable
CREATE TABLE "public"."ai_credential" (
    "ai_credential_id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "api_key_hint" TEXT NOT NULL,
    "base_url" TEXT,
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_credential_pkey" PRIMARY KEY ("ai_credential_id")
);

-- CreateTable
CREATE TABLE "public"."ai_model_preference" (
    "ai_model_preference_id" SERIAL NOT NULL,
    "task" "public"."ai_task" NOT NULL,
    "model_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "ai_credential_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_preference_pkey" PRIMARY KEY ("ai_model_preference_id")
);

-- CreateIndex
CREATE INDEX "ai_credential_user_id_idx" ON "public"."ai_credential"("user_id");

-- CreateIndex
CREATE INDEX "ai_model_preference_ai_credential_id_idx" ON "public"."ai_model_preference"("ai_credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_preference_user_id_task_key" ON "public"."ai_model_preference"("user_id", "task");

-- AddForeignKey
ALTER TABLE "public"."ai_credential" ADD CONSTRAINT "ai_credential_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_model_preference" ADD CONSTRAINT "ai_model_preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_model_preference" ADD CONSTRAINT "ai_model_preference_ai_credential_id_fkey" FOREIGN KEY ("ai_credential_id") REFERENCES "public"."ai_credential"("ai_credential_id") ON DELETE CASCADE ON UPDATE CASCADE;
