import { Logger } from '@nestjs/common';
import { OcrRunOutcome, Prisma } from '@prisma/client';
import { OcrFailure, toSafeCode } from './ocr-error-category';
import { estimateOcrCost } from './ocr-pricing';

/**
 * Medição de UMA chamada ao provedor, produzida pela OcrService e entregue à fila
 * por `context.onOpenAiCall`. É o mesmo objeto que alimenta a linha de log
 * `OCR_METRIC` (stage "openai") e a linha persistida, sem medir duas vezes.
 */
export interface OpenAiCallMetrics {
  provider: 'openai';
  model: string;
  openaiMs: number;
  /** Chamadas feitas pela camada própria de retentativa (sem as do SDK) */
  openaiCalls: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  providerRequestId: string | null;
}

export interface OcrRunRecord {
  ocrJobId: string;
  billId: string;
  attempt: number;
  startedAt: Date;
  outcome: OcrRunOutcome;
  failure?: OcrFailure | null;
  queueWaitMs: number;
  totalMs: number;
  /** Itens gravados; só faz sentido em COMPLETED */
  items?: number | null;
  call?: OpenAiCallMetrics | null;
}

type RunMetricClient = {
  ocrRunMetric: {
    create: (args: Prisma.OcrRunMetricCreateArgs) => Promise<unknown>;
  };
};

const toInt = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null;

/**
 * Grava a métrica de uma execução, em melhor esforço: uma falha aqui NUNCA falha
 * o job, muda a retentativa nem se propaga. Só loga o nome do erro, nunca a
 * mensagem (pode conter dados da conta).
 */
export async function recordOcrRunMetric(
  client: RunMetricClient,
  logger: Pick<Logger, 'warn'>,
  record: OcrRunRecord,
): Promise<void> {
  try {
    const call = record.call ?? null;
    const failure = record.failure ?? null;
    const cost = estimateOcrCost({
      model: call?.model,
      promptTokens: call?.promptTokens,
      completionTokens: call?.completionTokens,
    });

    await client.ocrRunMetric.create({
      data: {
        ocrJobId: record.ocrJobId,
        billId: record.billId,
        attempt: Math.max(0, Math.round(record.attempt)),
        startedAt: record.startedAt,
        provider: call?.provider ?? 'openai',
        model: call?.model ?? null,
        outcome: record.outcome,
        errorCategory: failure?.category ?? null,
        httpStatus: failure?.httpStatus ?? null,
        errorCode: failure?.errorCode ?? null,
        providerRequestId:
          failure?.providerRequestId ?? toSafeCode(call?.providerRequestId),
        queueWaitMs: toInt(record.queueWaitMs) ?? 0,
        openaiMs: toInt(call?.openaiMs),
        totalMs: toInt(record.totalMs) ?? 0,
        openaiCalls: toInt(call?.openaiCalls),
        promptTokens: toInt(call?.promptTokens),
        completionTokens: toInt(call?.completionTokens),
        totalTokens: toInt(call?.totalTokens),
        items: toInt(record.items),
        estimatedCostUsd: cost.estimatedCostUsd,
        pricingVersion: cost.pricingVersion,
      },
    });
  } catch (error) {
    const name =
      error instanceof Error
        ? error.name
        : typeof error === 'object'
          ? 'Object'
          : 'Unknown';
    logger.warn(
      `Não foi possível gravar a métrica da execução do OCR (job ${record.ocrJobId}): ${name}`,
    );
  }
}
