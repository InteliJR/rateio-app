/**
 * Relatório e comparação das métricas de OCR (Semana 5, P1, task 1).
 *
 * Função PURA sobre linhas de `ocr_run_metrics` (uma linha por execução): não acessa
 * banco, rede nem relógio. O script `scripts/ocr-report.ts` lê as linhas (arquivo JSON
 * ou banco, só leitura) e chama estas funções.
 *
 * Definições (as mesmas do documento docs/dev/ocr-metricas-comparacao.md):
 * - EXECUÇÃO: uma linha com `outcome` diferente de DISCARDED. Linhas DISCARDED (execução
 *   que perdeu o job ou cujo resultado já não vale) ficam fora de todas as contas e só
 *   são contadas à parte.
 * - LEITURA: as execuções de um mesmo `ocrJobId`, em ordem de `startedAt`, até uma que
 *   termina em COMPLETED ou FAILED_FINAL. Um job recriado (nova leitura da mesma conta)
 *   gera outra leitura. Execuções sem desfecho final são leituras EM ANDAMENTO e ficam
 *   fora da taxa de sucesso.
 * - PERCENTIL: método do posto mais próximo (nearest-rank): com n valores ordenados, o
 *   percentil p é o valor na posição ceil(p * n / 100). Não interpola. O SQL
 *   `percentile_cont` interpola, então os números podem diferir um pouco.
 * - CUSTO: estimado (ver ocr-pricing.ts), em micro-dólares inteiros para somar sem erro
 *   de ponto flutuante. Custo ausente é `null`, nunca 0, e modelos ou versões de preço
 *   diferentes nunca são somados no mesmo número.
 *   O custo de uma leitura soma só os custos CONHECIDOS das suas execuções: tentativas
 *   que falharam sem resposta (sem tokens) não têm custo e ficam de fora.
 */

export const OCR_RUN_OUTCOME_NAMES = [
  'COMPLETED',
  'RETRY_SCHEDULED',
  'FAILED_FINAL',
  'DISCARDED',
] as const;
export type OcrRunOutcomeName = (typeof OCR_RUN_OUTCOME_NAMES)[number];

/** Menos leituras terminais que isto: a diferença pode ser ruído. */
export const MIN_READS_FOR_COMPARISON = 30;
/** Menos amostras que isto: o p95 é praticamente o máximo. */
export const MIN_SAMPLES_FOR_P95 = 20;

const MICROS_PER_USD = 1_000_000;
const NO_CATEGORY = 'SEM_CATEGORIA';

export interface OcrRunRow {
  ocrJobId: string;
  attempt: number;
  startedAtMs: number;
  outcome: OcrRunOutcomeName;
  errorCategory: string | null;
  model: string | null;
  pricingVersion: string | null;
  queueWaitMs: number;
  openaiMs: number | null;
  totalMs: number;
  /** Custo estimado em micro-dólares (USD x 1.000.000), ou null se não houver */
  costMicros: number | null;
}

export interface ParsedRows {
  rows: OcrRunRow[];
  /** Linhas que não puderam ser lidas (campo obrigatório ausente ou inválido) */
  ignored: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNonNegativeNumber = (value: unknown): number | null => {
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const toNullableText = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const toTimeMs = (value: unknown): number | null => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
};

/**
 * Converte as linhas brutas (JSON exportado ou resultado do Prisma) para o formato
 * interno. Linha inválida não derruba o relatório: é contada em `ignored`.
 */
export function parseOcrRunRows(input: unknown): ParsedRows {
  if (!Array.isArray(input)) {
    throw new Error('As linhas de métrica devem ser um array.');
  }

  const rows: OcrRunRow[] = [];
  let ignored = 0;

  for (const raw of input) {
    if (!isRecord(raw)) {
      ignored += 1;
      continue;
    }

    const outcome = raw.outcome;
    const startedAtMs = toTimeMs(raw.startedAt);
    const queueWaitMs = toNonNegativeNumber(raw.queueWaitMs);
    const totalMs = toNonNegativeNumber(raw.totalMs);

    if (
      typeof raw.ocrJobId !== 'string' ||
      raw.ocrJobId.length === 0 ||
      typeof outcome !== 'string' ||
      !(OCR_RUN_OUTCOME_NAMES as readonly string[]).includes(outcome) ||
      startedAtMs === null ||
      queueWaitMs === null ||
      totalMs === null
    ) {
      ignored += 1;
      continue;
    }

    const cost = toNonNegativeNumber(raw.estimatedCostUsd);

    rows.push({
      ocrJobId: raw.ocrJobId,
      attempt: toNonNegativeNumber(raw.attempt) ?? 0,
      startedAtMs,
      outcome: outcome as OcrRunOutcomeName,
      errorCategory: toNullableText(raw.errorCategory),
      model: toNullableText(raw.model),
      pricingVersion: toNullableText(raw.pricingVersion),
      queueWaitMs,
      openaiMs: toNonNegativeNumber(raw.openaiMs),
      totalMs,
      costMicros: cost === null ? null : Math.round(cost * MICROS_PER_USD),
    });
  }

  return { rows, ignored };
}

/**
 * Percentil por posto mais próximo. `p` é inteiro de 1 a 100. Sem valores: null.
 * A conta usa inteiros (p * n / 100) para não sofrer com erro de ponto flutuante.
 */
export function nearestRankPercentile(
  values: readonly number[],
  p: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p * sorted.length) / 100);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

export interface Percentiles {
  samples: number;
  p50: number | null;
  p95: number | null;
}

export interface LatencyScopes {
  /** Todas as execuções (exceto DISCARDED) */
  all: Percentiles;
  /** Só as execuções COMPLETED */
  completed: Percentiles;
}

export interface ExecutionCost {
  model: string | null;
  pricingVersion: string | null;
  executions: number;
  executionsWithCost: number;
  /** Soma dos custos conhecidos; null se nenhuma execução do grupo tem custo */
  totalUsd: number | null;
}

export interface ReadCost {
  model: string | null;
  pricingVersion: string | null;
  completedReads: number;
  completedReadsWithCost: number;
  /** Média, só sobre as leituras concluídas com custo conhecido; null se não houver */
  avgUsdPerCompletedRead: number | null;
}

export interface FailureByCategory {
  category: string;
  executions: number;
  finalReads: number;
}

export interface OcrReport {
  period: { firstStartedAt: string | null; lastStartedAt: string | null };
  rows: { valid: number; ignored: number; discarded: number };
  executions: {
    total: number;
    completed: number;
    retryScheduled: number;
    failedFinal: number;
    successRate: number | null;
  };
  reads: {
    terminal: number;
    completed: number;
    failed: number;
    inProgress: number;
    successRate: number | null;
    avgExecutionsPerRead: number | null;
  };
  latencyMs: {
    queueWait: LatencyScopes;
    openai: LatencyScopes;
    total: LatencyScopes;
  };
  failures: FailureByCategory[];
  executionCost: ExecutionCost[];
  readCost: ReadCost[];
}

const ratio = (part: number, whole: number): number | null =>
  whole === 0 ? null : part / whole;

const microsToUsd = (micros: number): number =>
  Math.round(micros) / MICROS_PER_USD;

const percentiles = (values: number[]): Percentiles => ({
  samples: values.length,
  p50: nearestRankPercentile(values, 50),
  p95: nearestRankPercentile(values, 95),
});

const latencyScopes = (
  all: OcrRunRow[],
  pick: (row: OcrRunRow) => number | null,
): LatencyScopes => {
  const numbers = (rows: OcrRunRow[]) =>
    rows.map(pick).filter((value): value is number => value !== null);
  return {
    all: percentiles(numbers(all)),
    completed: percentiles(
      numbers(all.filter((r) => r.outcome === 'COMPLETED')),
    ),
  };
};

const compareNullableText = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
};

/** Chave de agrupamento por modelo e versão de preço (texto vazio já vira null antes). */
const groupKey = (model: string | null, version: string | null): string =>
  `${model ?? ''}\u0000${version ?? ''}`;

interface Read {
  rows: OcrRunRow[];
  final: OcrRunRow | null;
}

/** Monta as leituras de cada job, em ordem de início, e as em andamento. */
function buildReads(executions: OcrRunRow[]): {
  closed: Read[];
  inProgress: number;
} {
  const byJob = new Map<string, OcrRunRow[]>();
  for (const row of executions) {
    const list = byJob.get(row.ocrJobId);
    if (list) list.push(row);
    else byJob.set(row.ocrJobId, [row]);
  }

  const closed: Read[] = [];
  let inProgress = 0;

  for (const rows of byJob.values()) {
    rows.sort((a, b) => a.startedAtMs - b.startedAtMs || a.attempt - b.attempt);
    let current: OcrRunRow[] = [];
    for (const row of rows) {
      current.push(row);
      if (row.outcome === 'COMPLETED' || row.outcome === 'FAILED_FINAL') {
        closed.push({ rows: current, final: row });
        current = [];
      }
    }
    if (current.length > 0) inProgress += 1;
  }

  return { closed, inProgress };
}

export function buildOcrReport(parsed: ParsedRows): OcrReport {
  const valid = parsed.rows;
  const discarded = valid.filter((r) => r.outcome === 'DISCARDED').length;
  const executions = valid.filter((r) => r.outcome !== 'DISCARDED');

  const completedExecutions = executions.filter(
    (r) => r.outcome === 'COMPLETED',
  );
  const retryScheduled = executions.filter(
    (r) => r.outcome === 'RETRY_SCHEDULED',
  ).length;
  const failedFinalExecutions = executions.filter(
    (r) => r.outcome === 'FAILED_FINAL',
  ).length;

  const { closed, inProgress } = buildReads(executions);
  const completedReads = closed.filter((r) => r.final?.outcome === 'COMPLETED');
  const failedReads = closed.filter((r) => r.final?.outcome === 'FAILED_FINAL');

  const startTimes = valid.map((r) => r.startedAtMs);

  // Falhas por categoria
  const failureMap = new Map<string, FailureByCategory>();
  const failureEntry = (category: string) => {
    let entry = failureMap.get(category);
    if (!entry) {
      entry = { category, executions: 0, finalReads: 0 };
      failureMap.set(category, entry);
    }
    return entry;
  };
  for (const row of executions) {
    if (row.outcome === 'COMPLETED') continue;
    failureEntry(row.errorCategory ?? NO_CATEGORY).executions += 1;
  }
  for (const read of failedReads) {
    failureEntry(read.final?.errorCategory ?? NO_CATEGORY).finalReads += 1;
  }
  const failures = [...failureMap.values()].sort(
    (a, b) => b.executions - a.executions || (a.category < b.category ? -1 : 1),
  );

  // Custo por execução, agrupado por modelo e versão de preço da própria linha
  const execCostMap = new Map<
    string,
    {
      model: string | null;
      version: string | null;
      n: number;
      withCost: number;
      micros: number;
    }
  >();
  for (const row of executions) {
    const key = groupKey(row.model, row.pricingVersion);
    let entry = execCostMap.get(key);
    if (!entry) {
      entry = {
        model: row.model,
        version: row.pricingVersion,
        n: 0,
        withCost: 0,
        micros: 0,
      };
      execCostMap.set(key, entry);
    }
    entry.n += 1;
    if (row.costMicros !== null) {
      entry.withCost += 1;
      entry.micros += row.costMicros;
    }
  }
  const executionCost: ExecutionCost[] = [...execCostMap.values()]
    .sort(
      (a, b) =>
        compareNullableText(a.model, b.model) ||
        compareNullableText(a.version, b.version),
    )
    .map((e) => ({
      model: e.model,
      pricingVersion: e.version,
      executions: e.n,
      executionsWithCost: e.withCost,
      totalUsd: e.withCost === 0 ? null : microsToUsd(e.micros),
    }));

  // Custo por leitura concluída, agrupado pelo modelo e versão da execução final
  const readCostMap = new Map<
    string,
    {
      model: string | null;
      version: string | null;
      reads: number;
      withCost: number;
      micros: number;
    }
  >();
  for (const read of completedReads) {
    const final = read.final as OcrRunRow;
    const key = groupKey(final.model, final.pricingVersion);
    let entry = readCostMap.get(key);
    if (!entry) {
      entry = {
        model: final.model,
        version: final.pricingVersion,
        reads: 0,
        withCost: 0,
        micros: 0,
      };
      readCostMap.set(key, entry);
    }
    entry.reads += 1;
    if (final.costMicros !== null) {
      entry.withCost += 1;
      // Só soma execuções do mesmo modelo e versão de preço da execução final
      entry.micros += read.rows
        .filter((r) => groupKey(r.model, r.pricingVersion) === key)
        .reduce((sum, r) => sum + (r.costMicros ?? 0), 0);
    }
  }
  const readCost: ReadCost[] = [...readCostMap.values()]
    .sort(
      (a, b) =>
        compareNullableText(a.model, b.model) ||
        compareNullableText(a.version, b.version),
    )
    .map((e) => ({
      model: e.model,
      pricingVersion: e.version,
      completedReads: e.reads,
      completedReadsWithCost: e.withCost,
      avgUsdPerCompletedRead:
        e.withCost === 0 ? null : microsToUsd(e.micros / e.withCost),
    }));

  return {
    period: {
      firstStartedAt: startTimes.length
        ? new Date(Math.min(...startTimes)).toISOString()
        : null,
      lastStartedAt: startTimes.length
        ? new Date(Math.max(...startTimes)).toISOString()
        : null,
    },
    rows: { valid: valid.length, ignored: parsed.ignored, discarded },
    executions: {
      total: executions.length,
      completed: completedExecutions.length,
      retryScheduled,
      failedFinal: failedFinalExecutions,
      successRate: ratio(completedExecutions.length, executions.length),
    },
    reads: {
      terminal: closed.length,
      completed: completedReads.length,
      failed: failedReads.length,
      inProgress,
      successRate: ratio(completedReads.length, closed.length),
      avgExecutionsPerRead: ratio(
        closed.reduce((sum, r) => sum + r.rows.length, 0),
        closed.length,
      ),
    },
    latencyMs: {
      queueWait: latencyScopes(executions, (r) => r.queueWaitMs),
      openai: latencyScopes(executions, (r) => r.openaiMs),
      total: latencyScopes(executions, (r) => r.totalMs),
    },
    failures,
    executionCost,
    readCost,
  };
}

export type ComparisonUnit = 'fraction' | 'ms' | 'usd' | 'count';

export interface ComparisonLine {
  metric: string;
  unit: ComparisonUnit;
  baseline: number | null;
  current: number | null;
  /** current - baseline; null se faltar um dos lados */
  delta: number | null;
  /** delta / baseline em %; null se faltar um dos lados ou o baseline for 0 */
  deltaPct: number | null;
}

export interface Comparison {
  lines: ComparisonLine[];
  warnings: string[];
}

const line = (
  metric: string,
  unit: ComparisonUnit,
  baseline: number | null,
  current: number | null,
): ComparisonLine => {
  const delta =
    baseline !== null && current !== null ? current - baseline : null;
  return {
    metric,
    unit,
    baseline,
    current,
    delta,
    deltaPct:
      delta !== null && baseline !== null && baseline !== 0
        ? (delta / baseline) * 100
        : null,
  };
};

const costLabel = (model: string | null, version: string | null): string =>
  `${model ?? 'sem modelo'} @ ${version ?? 'sem versão de preço'}`;

/**
 * Compara dois relatórios. Nunca inventa número: faltando um lado, a diferença é null.
 * O custo só é comparado entre o MESMO modelo e a MESMA versão de preço.
 */
export function compareOcrReports(
  baseline: OcrReport,
  current: OcrReport,
): Comparison {
  const lines: ComparisonLine[] = [
    line(
      'Taxa de sucesso por leitura',
      'fraction',
      baseline.reads.successRate,
      current.reads.successRate,
    ),
    line(
      'Taxa de sucesso por execução',
      'fraction',
      baseline.executions.successRate,
      current.executions.successRate,
    ),
    line(
      'Execuções por leitura (média)',
      'count',
      baseline.reads.avgExecutionsPerRead,
      current.reads.avgExecutionsPerRead,
    ),
    line(
      'Espera na fila p50 (todas)',
      'ms',
      baseline.latencyMs.queueWait.all.p50,
      current.latencyMs.queueWait.all.p50,
    ),
    line(
      'Espera na fila p95 (todas)',
      'ms',
      baseline.latencyMs.queueWait.all.p95,
      current.latencyMs.queueWait.all.p95,
    ),
    line(
      'OpenAI p50 (concluídas)',
      'ms',
      baseline.latencyMs.openai.completed.p50,
      current.latencyMs.openai.completed.p50,
    ),
    line(
      'OpenAI p95 (concluídas)',
      'ms',
      baseline.latencyMs.openai.completed.p95,
      current.latencyMs.openai.completed.p95,
    ),
    line(
      'Total p50 (concluídas)',
      'ms',
      baseline.latencyMs.total.completed.p50,
      current.latencyMs.total.completed.p50,
    ),
    line(
      'Total p95 (concluídas)',
      'ms',
      baseline.latencyMs.total.completed.p95,
      current.latencyMs.total.completed.p95,
    ),
  ];

  const baselineCosts = new Map(
    baseline.readCost.map((c) => [groupKey(c.model, c.pricingVersion), c]),
  );
  const currentCosts = new Map(
    current.readCost.map((c) => [groupKey(c.model, c.pricingVersion), c]),
  );
  const costKeys = [
    ...new Set([...baselineCosts.keys(), ...currentCosts.keys()]),
  ];
  const costGroups = costKeys
    .map((key) => ({
      key,
      baseline: baselineCosts.get(key),
      current: currentCosts.get(key),
    }))
    .sort((a, b) => {
      const x = (a.baseline ?? a.current) as ReadCost;
      const y = (b.baseline ?? b.current) as ReadCost;
      return (
        compareNullableText(x.model, y.model) ||
        compareNullableText(x.pricingVersion, y.pricingVersion)
      );
    });

  for (const group of costGroups) {
    const ref = (group.baseline ?? group.current) as ReadCost;
    lines.push(
      line(
        `Custo médio por leitura concluída, USD [${costLabel(ref.model, ref.pricingVersion)}]`,
        'usd',
        group.baseline?.avgUsdPerCompletedRead ?? null,
        group.current?.avgUsdPerCompletedRead ?? null,
      ),
    );
  }

  const warnings: string[] = [];
  const sides: [string, OcrReport][] = [
    ['baseline', baseline],
    ['atual', current],
  ];
  for (const [name, report] of sides) {
    if (report.reads.terminal < MIN_READS_FOR_COMPARISON) {
      warnings.push(
        `${name} tem ${report.reads.terminal} leituras terminais (menos de ${MIN_READS_FOR_COMPARISON}): a diferença pode ser ruído.`,
      );
    }
    if (report.latencyMs.total.completed.samples < MIN_SAMPLES_FOR_P95) {
      warnings.push(
        `${name} tem ${report.latencyMs.total.completed.samples} execuções concluídas (menos de ${MIN_SAMPLES_FOR_P95}): o p95 é praticamente o máximo.`,
      );
    }
  }
  const sameCostGroups =
    baselineCosts.size === currentCosts.size &&
    [...baselineCosts.keys()].every((key) => currentCosts.has(key));
  if (!sameCostGroups) {
    warnings.push(
      'baseline e atual têm conjuntos diferentes de modelo e versão de preço: o custo só é comparável dentro do mesmo modelo e versão.',
    );
  }

  return { lines, warnings };
}

const dash = '—';

const formatUnit = (value: number | null, unit: ComparisonUnit): string => {
  if (value === null) return dash;
  switch (unit) {
    case 'fraction':
      return `${(value * 100).toFixed(1)}%`;
    case 'ms':
      return `${Math.round(value)} ms`;
    case 'usd':
      return value.toFixed(6);
    case 'count':
      return value.toFixed(2);
  }
};

const formatDelta = (l: ComparisonLine): string => {
  if (l.delta === null) return dash;
  const sign = l.delta > 0 ? '+' : '';
  switch (l.unit) {
    case 'fraction':
      return `${sign}${(l.delta * 100).toFixed(1)} p.p.`;
    case 'ms':
      return `${sign}${Math.round(l.delta)} ms`;
    case 'usd':
      return `${sign}${l.delta.toFixed(6)}`;
    case 'count':
      return `${sign}${l.delta.toFixed(2)}`;
  }
};

const formatPct = (value: number | null): string =>
  value === null ? dash : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

const percentCell = (value: number | null): string =>
  value === null ? dash : `${(value * 100).toFixed(1)}%`;

const msCell = (value: number | null): string =>
  value === null ? dash : `${Math.round(value)}`;

/** Texto em Markdown do relatório. `null` aparece como "—" (sem dado), nunca como 0. */
export function renderOcrReportMarkdown(report: OcrReport): string {
  const out: string[] = [];
  const p = report.period;
  out.push(
    `Período (início das execuções): ${p.firstStartedAt ?? dash} a ${p.lastStartedAt ?? dash}`,
  );
  out.push(
    `Linhas válidas: ${report.rows.valid} | ignoradas: ${report.rows.ignored} | descartadas (DISCARDED): ${report.rows.discarded}`,
  );
  out.push('');
  out.push('## Sucesso');
  out.push('');
  out.push('| Medida | Valor |');
  out.push('| --- | ---: |');
  out.push(`| Leituras terminais | ${report.reads.terminal} |`);
  out.push(`| Leituras concluídas | ${report.reads.completed} |`);
  out.push(`| Leituras com falha final | ${report.reads.failed} |`);
  out.push(
    `| Leituras em andamento (fora da taxa) | ${report.reads.inProgress} |`,
  );
  out.push(
    `| Taxa de sucesso por leitura | ${percentCell(report.reads.successRate)} |`,
  );
  out.push(`| Execuções (sem DISCARDED) | ${report.executions.total} |`);
  out.push(
    `| Taxa de sucesso por execução | ${percentCell(report.executions.successRate)} |`,
  );
  out.push(
    `| Execuções por leitura (média) | ${report.reads.avgExecutionsPerRead === null ? dash : report.reads.avgExecutionsPerRead.toFixed(2)} |`,
  );
  out.push('');
  out.push('## Tempos (ms, percentil por posto mais próximo)');
  out.push('');
  out.push(
    '| Medida | Amostras (todas) | p50 (todas) | p95 (todas) | Amostras (concluídas) | p50 (concluídas) | p95 (concluídas) |',
  );
  out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  const latencyRows: [string, LatencyScopes][] = [
    ['Espera na fila', report.latencyMs.queueWait],
    ['OpenAI', report.latencyMs.openai],
    ['Total da execução', report.latencyMs.total],
  ];
  for (const [label, s] of latencyRows) {
    out.push(
      `| ${label} | ${s.all.samples} | ${msCell(s.all.p50)} | ${msCell(s.all.p95)} | ${s.completed.samples} | ${msCell(s.completed.p50)} | ${msCell(s.completed.p95)} |`,
    );
  }
  out.push('');
  out.push('## Falhas por categoria');
  out.push('');
  if (report.failures.length === 0) {
    out.push('Nenhuma execução com falha.');
  } else {
    out.push('| Categoria | Execuções | Leituras com falha final |');
    out.push('| --- | ---: | ---: |');
    for (const f of report.failures) {
      out.push(`| ${f.category} | ${f.executions} | ${f.finalReads} |`);
    }
  }
  out.push('');
  out.push('## Custo estimado (USD)');
  out.push('');
  out.push(
    '| Modelo @ versão de preço | Leituras concluídas | Com custo conhecido | Custo médio por leitura concluída |',
  );
  out.push('| --- | ---: | ---: | ---: |');
  if (report.readCost.length === 0) {
    out.push(`| ${dash} | 0 | 0 | ${dash} |`);
  }
  for (const c of report.readCost) {
    out.push(
      `| ${costLabel(c.model, c.pricingVersion)} | ${c.completedReads} | ${c.completedReadsWithCost} | ${c.avgUsdPerCompletedRead === null ? dash : c.avgUsdPerCompletedRead.toFixed(6)} |`,
    );
  }
  out.push('');
  out.push(
    '| Modelo @ versão de preço | Execuções | Com custo conhecido | Soma do custo conhecido |',
  );
  out.push('| --- | ---: | ---: | ---: |');
  if (report.executionCost.length === 0) {
    out.push(`| ${dash} | 0 | 0 | ${dash} |`);
  }
  for (const c of report.executionCost) {
    out.push(
      `| ${costLabel(c.model, c.pricingVersion)} | ${c.executions} | ${c.executionsWithCost} | ${c.totalUsd === null ? dash : c.totalUsd.toFixed(6)} |`,
    );
  }
  out.push('');
  out.push(
    'O custo é estimado e soma só os custos conhecidos: tentativas que falharam sem resposta (sem tokens) não entram.',
  );
  return out.join('\n');
}

export function renderComparisonMarkdown(comparison: Comparison): string {
  const out: string[] = [];
  out.push('| Métrica | Baseline | Atual | Diferença | Variação |');
  out.push('| --- | ---: | ---: | ---: | ---: |');
  for (const l of comparison.lines) {
    out.push(
      `| ${l.metric} | ${formatUnit(l.baseline, l.unit)} | ${formatUnit(l.current, l.unit)} | ${formatDelta(l)} | ${formatPct(l.deltaPct)} |`,
    );
  }
  if (comparison.warnings.length > 0) {
    out.push('');
    out.push('Avisos:');
    for (const w of comparison.warnings) out.push(`- ${w}`);
  }
  return out.join('\n');
}

/**
 * Valida o JSON de um relatório salvo antes (usado como baseline). Confere só o
 * formato mínimo; o conteúdo é o que o próprio `buildOcrReport` gerou.
 */
export function parseSavedOcrReport(input: unknown): OcrReport {
  const shapeOk =
    isRecord(input) &&
    isRecord(input.rows) &&
    isRecord(input.executions) &&
    isRecord(input.reads) &&
    isRecord(input.latencyMs) &&
    isRecord(input.latencyMs.queueWait) &&
    isRecord(input.latencyMs.openai) &&
    isRecord(input.latencyMs.total) &&
    Array.isArray(input.failures) &&
    Array.isArray(input.executionCost) &&
    Array.isArray(input.readCost);

  if (!shapeOk) {
    throw new Error(
      'O arquivo não parece um relatório de OCR salvo com --save (faltam campos).',
    );
  }

  return input as unknown as OcrReport;
}
