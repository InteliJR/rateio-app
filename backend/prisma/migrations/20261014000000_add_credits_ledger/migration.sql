-- CreateEnum
CREATE TYPE "CreditPolicy" AS ENUM ('METERED', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('FREE_GRANT', 'PURCHASE', 'AD_REWARD', 'RESERVE', 'CONSUME', 'RELEASE', 'ADMIN_ADJUST');

-- CreateEnum
CREATE TYPE "CreditReservationStatus" AS ENUM ('HELD', 'CONSUMED', 'RELEASED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "creditPolicy" "CreditPolicy" NOT NULL DEFAULT 'METERED';

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "ocrJobId" TEXT,
    "purchaseToken" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_reservations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ocrJobId" TEXT NOT NULL,
    "status" "CreditReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_idempotencyKey_key" ON "credit_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_transactions_userId_createdAt_idx" ON "credit_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_transactions_ocrJobId_idx" ON "credit_transactions"("ocrJobId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_reservations_ocrJobId_key" ON "credit_reservations"("ocrJobId");

-- CreateIndex
CREATE INDEX "credit_reservations_userId_idx" ON "credit_reservations"("userId");

-- CreateIndex
CREATE INDEX "credit_reservations_status_expiresAt_idx" ON "credit_reservations"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
