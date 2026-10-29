-- Aditiva: uma coluna com valor padrão (metadado, sem reescrita da tabela no
-- Postgres 11+), sem backfill. Jobs existentes ficam na execução 1.
-- Aplicar ANTES do deploy do código que lê/escreve a coluna.
--
-- creditRun é a "execução de cobrança" do job: o OcrJob é reaproveitado quando
-- a leitura é recriada (imagem trocada, retry-ocr), então a reserva de crédito
-- não pode ser única por job. A chave passada ao ledger é:
--   creditRun = 1  ->  "<jobId>"
--   creditRun > 1  ->  "<jobId>:<creditRun>"
-- Consequência documentada: credit_transactions.ocrJobId e
-- credit_reservations.ocrJobId (texto, sem FK) passam a guardar "<jobId>:<n>"
-- para n > 1. Relatórios que juntam com ocr_jobs.id devem usar
-- split_part("ocrJobId", ':', 1). Nenhuma tabela do ledger é alterada.
--
-- Reversão manual (o Prisma não gera "down"):
--   ALTER TABLE "ocr_jobs" DROP COLUMN "creditRun";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261029000000_add_ocr_job_credit_run';

-- AlterTable
ALTER TABLE "ocr_jobs" ADD COLUMN     "creditRun" INTEGER NOT NULL DEFAULT 1;
