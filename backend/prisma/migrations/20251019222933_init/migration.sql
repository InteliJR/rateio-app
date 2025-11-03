/*
  Warnings:

  - You are about to drop the `posts` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `password` to the `users` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password" TEXT NOT NULL,
ALTER COLUMN "name" SET NOT NULL;

-- DropTable
DROP TABLE "public"."posts";

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "revoked_tokens_token_key" ON "revoked_tokens"("token");

-- CreateIndex
CREATE INDEX "revoked_tokens_token_idx" ON "revoked_tokens"("token");

-- CreateIndex
CREATE INDEX "revoked_tokens_expiresAt_idx" ON "revoked_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "revoked_tokens_userId_idx" ON "revoked_tokens"("userId");
