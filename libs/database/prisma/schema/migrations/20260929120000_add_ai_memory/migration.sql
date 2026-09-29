-- CreateEnum
CREATE TYPE "public"."ai_memory_mode" AS ENUM ('OFF', 'COMPACT', 'EXTENDED');

-- CreateEnum
CREATE TYPE "public"."ai_memory_source" AS ENUM ('ACTIVITY_ANALYSIS', 'PLAN_ADAPTATION', 'COACH_ASSISTANT', 'EVENT_GENERATION', 'EVENT_MODIFICATION');

-- AlterTable
ALTER TABLE "public"."coach_athlete" ADD COLUMN     "ai_memory_mode" "public"."ai_memory_mode" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "ai_memory_summary" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ai_memory_summary_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."ai_memory_note" (
    "ai_memory_note_id" SERIAL NOT NULL,
    "source" "public"."ai_memory_source" NOT NULL,
    "content" TEXT NOT NULL,
    "coach_athlete_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_memory_note_pkey" PRIMARY KEY ("ai_memory_note_id")
);

-- CreateIndex
CREATE INDEX "ai_memory_note_coach_athlete_id_created_at_idx" ON "public"."ai_memory_note"("coach_athlete_id", "created_at");

-- AddForeignKey
ALTER TABLE "public"."ai_memory_note" ADD CONSTRAINT "ai_memory_note_coach_athlete_id_fkey" FOREIGN KEY ("coach_athlete_id") REFERENCES "public"."coach_athlete"("coach_athlete_id") ON DELETE CASCADE ON UPDATE CASCADE;

