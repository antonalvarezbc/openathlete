-- Power and heart rate records are read by duration, not by distance
ALTER TABLE "public"."record" ALTER COLUMN "distance" DROP NOT NULL,
ADD COLUMN "duration" INTEGER;
