import type { PrismaClient } from '@prisma/client';

/**
 * Colunas lidas de `ocr_run_metrics` para o relatório. Só medição: de propósito NÃO
 * inclui billId, ids de requisição do provedor, códigos de erro nem qualquer texto.
 */
export const OCR_REPORT_SELECT = {
  ocrJobId: true,
  attempt: true,
  startedAt: true,
  outcome: true,
  errorCategory: true,
  model: true,
  pricingVersion: true,
  queueWaitMs: true,
  openaiMs: true,
  totalMs: true,
  estimatedCostUsd: true,
} as const;

/**
 * O leitor só enxerga `findMany`: por tipo, esta função não consegue criar, alterar
 * nem apagar nada.
 */
export type OcrRunMetricReader = {
  ocrRunMetric: Pick<PrismaClient['ocrRunMetric'], 'findMany'>;
};

export interface OcrReportRange {
  /** Início inclusivo, em UTC */
  since?: Date;
  /** Fim exclusivo, em UTC */
  until?: Date;
}

/** Lê as linhas do período, na ordem de início, prontas para `parseOcrRunRows`. */
export async function loadOcrRunRows(
  client: OcrRunMetricReader,
  range: OcrReportRange = {},
): Promise<unknown[]> {
  const startedAt = {
    ...(range.since ? { gte: range.since } : {}),
    ...(range.until ? { lt: range.until } : {}),
  };

  const rows = await client.ocrRunMetric.findMany({
    where: range.since || range.until ? { startedAt } : {},
    select: OCR_REPORT_SELECT,
    orderBy: { startedAt: 'asc' },
  });

  // O Decimal do Prisma vira texto: o parser aceita número e texto, e perderia o objeto
  return rows.map((row) => ({
    ...row,
    estimatedCostUsd: row.estimatedCostUsd?.toString() ?? null,
  }));
}
