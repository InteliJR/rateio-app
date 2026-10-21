/**
 * Tabela de preços usada para ESTIMAR o custo de cada leitura de OCR.
 *
 * - É uma ESTIMATIVA: usa só tokens de entrada e de saída retornados pelo provedor.
 *   Não aplica desconto de cache nem de Batch, então a estimativa pode ficar acima
 *   do real quando houver cache. Os tokens de imagem já vêm dentro dos de entrada.
 * - Cada tabela é versionada e datada (versão, vigência, moeda e fonte). Para mudar
 *   um preço ou o modelo, ACRESCENTE uma tabela nova com outra versão e vigência; não
 *   edite as antigas, para o histórico (pricingVersion gravado em cada linha) continuar
 *   explicável.
 * - O custo é `null` (nunca 0) quando faltarem tokens ou o modelo não estiver na
 *   tabela vigente.
 * - Confirmar os valores na página oficial do modelo antes do merge.
 */
export interface ModelPrice {
  /** USD por milhão de tokens de entrada */
  inputPerMillion: number;
  /** USD por milhão de tokens de saída */
  outputPerMillion: number;
}

export interface PricingTable {
  version: string;
  /** Data de vigência (AAAA-MM-DD, UTC) */
  effectiveFrom: string;
  currency: 'USD';
  source: string;
  models: Record<string, ModelPrice>;
}

export const OCR_PRICING_TABLES: readonly PricingTable[] = [
  {
    version: 'openai-2026-10-21',
    effectiveFrom: '2026-10-21',
    currency: 'USD',
    source:
      'https://developers.openai.com/api/docs/models/gpt-4.1-mini (consultado em 21/10/2026)',
    models: {
      'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
    },
  },
];

export interface CostEstimate {
  estimatedCostUsd: number | null;
  pricingVersion: string | null;
}

const NO_ESTIMATE: CostEstimate = {
  estimatedCostUsd: null,
  pricingVersion: null,
};

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Tabela vigente na data: a de maior `effectiveFrom` que já começou. */
export function findPricingTable(
  at: Date,
  tables: readonly PricingTable[] = OCR_PRICING_TABLES,
): PricingTable | null {
  let current: PricingTable | null = null;

  for (const table of tables) {
    const start = Date.parse(`${table.effectiveFrom}T00:00:00Z`);
    if (Number.isNaN(start) || start > at.getTime()) continue;

    if (
      current === null ||
      start > Date.parse(`${current.effectiveFrom}T00:00:00Z`)
    ) {
      current = table;
    }
  }

  return current;
}

export function estimateOcrCost(
  input: {
    model: string | null | undefined;
    promptTokens: number | null | undefined;
    completionTokens: number | null | undefined;
    at?: Date;
  },
  tables: readonly PricingTable[] = OCR_PRICING_TABLES,
): CostEstimate {
  const { model, promptTokens, completionTokens } = input;

  if (
    !model ||
    !isTokenCount(promptTokens) ||
    !isTokenCount(completionTokens)
  ) {
    return NO_ESTIMATE;
  }

  const table = findPricingTable(input.at ?? new Date(), tables);
  const price = table?.models[model];

  if (!table || !price) {
    return NO_ESTIMATE;
  }

  const cost =
    (promptTokens * price.inputPerMillion +
      completionTokens * price.outputPerMillion) /
    1_000_000;

  return {
    // 6 casas, a mesma precisão da coluna estimatedCostUsd
    estimatedCostUsd: Math.round(cost * 1_000_000) / 1_000_000,
    pricingVersion: table.version,
  };
}
