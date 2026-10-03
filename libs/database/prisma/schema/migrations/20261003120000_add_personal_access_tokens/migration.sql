-- CreateTable
CREATE TABLE "public"."personal_access_token" (
    "personal_access_token_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_access_token_pkey" PRIMARY KEY ("personal_access_token_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_access_token_token_hash_key" ON "public"."personal_access_token"("token_hash");

-- CreateIndex
CREATE INDEX "personal_access_token_user_id_idx" ON "public"."personal_access_token"("user_id");

-- AddForeignKey
ALTER TABLE "public"."personal_access_token" ADD CONSTRAINT "personal_access_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

