-- Aditiva: não altera nem apaga dados existentes e não exige backfill.
-- Aplicar ANTES do deploy do código que usa a coluna e a tabela.
--
-- Reversão manual (o Prisma não gera "down"):
--   DROP TABLE "idempotency_keys";
--   ALTER TABLE "ocr_jobs" DROP COLUMN "imageKey";

-- Imagem alvo/processada por cada job (NULL para jobs anteriores a esta migração)
ALTER TABLE "ocr_jobs" ADD COLUMN "imageKey" TEXT;

-- Chaves de idempotência por usuário e operação de OCR
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "ocrJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idempotency_keys_billId_idx" ON "idempotency_keys"("billId");

CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");

CREATE UNIQUE INDEX "idempotency_keys_userId_key_key" ON "idempotency_keys"("userId", "key");

ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
