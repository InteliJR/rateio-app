import { OcrResult } from './dto/ocr-result.dto';
import { MAX_MONEY_VALUE } from '../common/numeric-limits';
import { OcrErrorCategoryName } from './ocr-error-category';

/**
 * Cobrança por crédito na fila de OCR. Tudo aqui é inerte enquanto
 * CREDITS_ENFORCEMENT_ENABLED não for exatamente 'true' (padrão: desligado).
 */
export function isCreditsEnforcementEnabled(): boolean {
  return process.env.CREDITS_ENFORCEMENT_ENABLED === 'true';
}

/**
 * Chave da reserva de UMA execução de cobrança do job. O OcrJob é reaproveitado
 * quando a leitura é recriada (imagem trocada, retry-ocr), então a chave muda a
 * cada recriação: `jobId` na execução 1 e `jobId:n` depois. Retentativa técnica
 * e lock vencido NÃO mudam `creditRun`, logo reaproveitam a mesma reserva.
 *
 * `credit_transactions.ocrJobId` e `credit_reservations.ocrJobId` guardam esta
 * chave (texto, sem FK): para n > 1 vem `jobId:n`.
 */
export function creditRunKey(job: { id: string; creditRun?: number }): string {
  const run = job.creditRun ?? 1;
  return run > 1 ? `${job.id}:${run}` : job.id;
}

/**
 * "Leitura utilizável", para decidir entre consumir e liberar o crédito.
 *
 * ATENÇÃO: a definição exata AINDA AGUARDA A CLIENTE. Esta é a proposta técnica:
 * (a) o resultado vem do JSON do modelo que passou na validação do DTO, e não de
 *     um leitor de contingência. Isso também garante (c): a validação do DTO já
 *     confere que itens + taxas - descontos batem com o total em até R$ 0,01
 *     (o OcrResult não carrega taxas nem descontos, então a soma não é refeita aqui);
 * (b) há ao menos 1 item com nome, quantidade e preço total maiores que zero;
 * (d) nenhum valor passa de MAX_MONEY_VALUE.
 *
 * Leitura NÃO utilizável: o resultado é gravado como sempre (a conta vai a
 * REVIEWING com os itens lidos); só o crédito é liberado.
 */
export function isUsableOcrResult(result: OcrResult): boolean {
  if (result.source !== 'MODEL_JSON') {
    return false;
  }

  if (!Array.isArray(result.items) || result.items.length === 0) {
    return false;
  }

  const validMoney = (value: unknown) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value <= MAX_MONEY_VALUE;

  const itemsOk = result.items.every(
    (item) =>
      typeof item.name === 'string' &&
      item.name.trim().length > 0 &&
      Number.isFinite(item.quantity) &&
      item.quantity > 0 &&
      validMoney(item.totalPrice) &&
      item.totalPrice > 0 &&
      validMoney(item.unitPrice),
  );

  if (!itemsOk) {
    return false;
  }

  return result.totalAmount === undefined || validMoney(result.totalAmount);
}

/**
 * Motivos gravados no ledger ao liberar. Códigos fixos e curtos: nunca a
 * mensagem do erro (pode conter dados da conta ou do provedor).
 */
export const CREDIT_RELEASE_REASONS = {
  unusableResult: 'UNUSABLE_RESULT',
  discardedBillChanged: 'DISCARDED_BILL_CHANGED',
} as const;

export function failedReleaseReason(category: OcrErrorCategoryName): string {
  return `OCR_FAILED_${category}`;
}
