-- Aditiva: não altera nem apaga dados existentes e não exige backfill.
-- Aplicar ANTES do deploy do código que grava nesta tabela.
--
-- Esta tabela NÃO guarda userId, imageUrl, rawText, itens, preços nem mensagens
-- de erro cruas. Sem chave estrangeira de propósito (o histórico de custo
-- sobrevive à exclusão da conta, sem ligação com uma pessoa) e sem índice
-- único em (ocrJobId, attempt): o job é recriado e attempts volta a 0.
--
-- Reversão manual (o Prisma não gera "down"):
--   DROP TABLE "ocr_run_metrics";
--   DROP TYPE "OcrErrorCategory";
--   DROP TYPE "OcrRunOutcome";

-- CreateEnum
CREATE TYPE "OcrRunOutcome" AS ENUM ('COMPLETED', 'RETRY_SCHEDULED', 'FAILED_FINAL', 'DISCARDED');

-- CreateEnum
CREATE TYPE "OcrErrorCategory" AS ENUM ('TRANSIENT', 'TIMEOUT', 'CREDENTIAL', 'INVALID_REQUEST', 'IMAGE_MISSING', 'INVALID_RESULT', 'EXHAUSTED', 'INTERNAL', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ocr_run_metrics" (
    "id" TEXT NOT NULL,
    "ocrJobId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "outcome" "OcrRunOutcome" NOT NULL,
    "errorCategory" "OcrErrorCategory",
    "httpStatus" INTEGER,
    "errorCode" VARCHAR(64),
    "providerRequestId" VARCHAR(64),
    "queueWaitMs" INTEGER NOT NULL,
    "openaiMs" INTEGER,
    "totalMs" INTEGER NOT NULL,
    "openaiCalls" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "items" INTEGER,
    "estimatedCostUsd" DECIMAL(12,6),
    "pricingVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_run_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ocr_run_metrics_createdAt_idx" ON "ocr_run_metrics"("createdAt");

-- CreateIndex
CREATE INDEX "ocr_run_metrics_ocrJobId_idx" ON "ocr_run_metrics"("ocrJobId");

-- CreateIndex
CREATE INDEX "ocr_run_metrics_model_createdAt_idx" ON "ocr_run_metrics"("model", "createdAt");
