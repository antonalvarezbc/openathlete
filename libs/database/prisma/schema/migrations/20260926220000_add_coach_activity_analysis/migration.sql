-- CreateTable
CREATE TABLE "public"."coach_activity_analysis" (
    "activity_analysis_id" SERIAL NOT NULL,
    "event_activity_id" INTEGER NOT NULL,
    "coach_user_id" INTEGER NOT NULL,
    "coach_context" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "feedback_draft" TEXT NOT NULL,
    "context_snapshot" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_activity_analysis_pkey" PRIMARY KEY ("activity_analysis_id")
);

-- CreateIndex
CREATE INDEX "coach_activity_analysis_coach_user_id_event_activity_id_cre_idx" ON "public"."coach_activity_analysis"("coach_user_id", "event_activity_id", "created_at");

-- CreateIndex
CREATE INDEX "coach_activity_analysis_event_activity_id_idx" ON "public"."coach_activity_analysis"("event_activity_id");

-- AddForeignKey
ALTER TABLE "public"."coach_activity_analysis" ADD CONSTRAINT "coach_activity_analysis_event_activity_id_fkey" FOREIGN KEY ("event_activity_id") REFERENCES "public"."event_activity"("event_activity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coach_activity_analysis" ADD CONSTRAINT "coach_activity_analysis_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "public"."user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
