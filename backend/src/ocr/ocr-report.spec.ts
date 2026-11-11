import {
  MIN_READS_FOR_COMPARISON,
  buildOcrReport,
  compareOcrReports,
  nearestRankPercentile,
  parseOcrRunRows,
  parseSavedOcrReport,
  renderComparisonMarkdown,
  renderOcrReportMarkdown,
} from './ocr-report';

/**
 * Relatório e comparação das métricas de OCR, com linhas FICTÍCIAS e resultados
 * calculados à mão (as contas estão nos comentários). Não prova: o formato das linhas
 * lidas de um Postgres real, nem nenhum número de produção.
 */
describe('ocr-report', () => {
  const t = (minutes: number) =>
    new Date(Date.UTC(2026, 10, 1, 10, minutes, 0)).toISOString();

  const row = (o: Record<string, unknown>) => ({
    ocrJobId: 'job',
    attempt: 1,
    startedAt: t(0),
    outcome: 'COMPLETED',
    errorCategory: null,
    model: 'gpt-4.1-mini',
    pricingVersion: 'v1',
    queueWaitMs: 100,
    openaiMs: 1000,
    totalMs: 1100,
    estimatedCostUsd: null,
    ...o,
  });

  /**
   * Conjunto de referência (8 linhas válidas, 1 inválida):
   * A1 retentativa (INVALID_RESULT, custo 0,0003) + A2 concluída (0,0012)  -> leitura A
   * B  concluída (0,0008)                                                  -> leitura B
   * C  falha final IMAGE_MISSING, sem modelo e sem custo                   -> leitura C
   * D  retentativa TIMEOUT sem desfecho                                    -> em andamento
   * E  DISCARDED (valores enormes: não pode entrar em conta nenhuma)
   * F  concluída com outro modelo e versão (0,002)                         -> leitura F
   * G  concluída com modelo fora da tabela (sem custo)                     -> leitura G
   */
  const reference = [
    row({
      ocrJobId: 'A',
      attempt: 1,
      startedAt: t(0),
      outcome: 'RETRY_SCHEDULED',
      errorCategory: 'INVALID_RESULT',
      queueWaitMs: 100,
      openaiMs: 2000,
      totalMs: 2100,
      estimatedCostUsd: '0.000300',
    }),
    row({
      ocrJobId: 'A',
      attempt: 2,
      startedAt: t(1),
      outcome: 'COMPLETED',
      queueWaitMs: 30000,
      openaiMs: 4000,
      totalMs: 4100,
      estimatedCostUsd: 0.0012,
    }),
    row({
      ocrJobId: 'B',
      startedAt: t(2),
      queueWaitMs: 200,
      openaiMs: 6000,
      totalMs: 6100,
      estimatedCostUsd: '0.000800',
    }),
    row({
      ocrJobId: 'C',
      startedAt: t(3),
      outcome: 'FAILED_FINAL',
      errorCategory: 'IMAGE_MISSING',
      model: null,
      pricingVersion: null,
      queueWaitMs: 300,
      openaiMs: null,
      totalMs: 100,
    }),
    row({
      ocrJobId: 'D',
      startedAt: t(4),
      outcome: 'RETRY_SCHEDULED',
      errorCategory: 'TIMEOUT',
      queueWaitMs: 150,
      openaiMs: 1000,
      totalMs: 1200,
    }),
    row({
      ocrJobId: 'E',
      startedAt: t(5),
      outcome: 'DISCARDED',
      errorCategory: 'TRANSIENT',
      queueWaitMs: 999999,
      openaiMs: 999999,
      totalMs: 999999,
      estimatedCostUsd: 5,
    }),
    row({
      ocrJobId: 'F',
      startedAt: t(6),
      model: 'gpt-5-x',
      pricingVersion: 'v2',
      queueWaitMs: 400,
      openaiMs: 8000,
      totalMs: 8100,
      estimatedCostUsd: 0.002,
    }),
    row({
      ocrJobId: 'G',
      startedAt: t(7),
      model: 'other',
      pricingVersion: null,
      queueWaitMs: 500,
      openaiMs: 9000,
      totalMs: 9100,
    }),
    { ocrJobId: 'X' }, // inválida: sem outcome
  ];

  const reportOf = (raw: unknown[]) => buildOcrReport(parseOcrRunRows(raw));

  describe('nearestRankPercentile', () => {
    it('sem valores: null', () => {
      expect(nearestRankPercentile([], 50)).toBeNull();
      expect(nearestRankPercentile([], 95)).toBeNull();
    });

    it('um valor só: é o p50 e o p95', () => {
      expect(nearestRankPercentile([7], 50)).toBe(7);
      expect(nearestRankPercentile([7], 95)).toBe(7);
    });

    it('1..20: p50 é o 10º e p95 é o 19º (posição ceil(p*n/100))', () => {
      const values = Array.from({ length: 20 }, (_, i) => i + 1);
      expect(nearestRankPercentile(values, 50)).toBe(10);
      expect(nearestRankPercentile(values, 95)).toBe(19);
    });

    it('1..100: p95 é exatamente 95, e 1..10: p95 é o máximo (ceil(9,5) = 10)', () => {
      expect(
        nearestRankPercentile(
          Array.from({ length: 100 }, (_, i) => i + 1),
          95,
        ),
      ).toBe(95);
      expect(
        nearestRankPercentile(
          Array.from({ length: 10 }, (_, i) => i + 1),
          95,
        ),
      ).toBe(10);
    });

    it('não depende da ordem de entrada e não altera o array recebido', () => {
      const input = [30, 10, 20, 40];
      expect(nearestRankPercentile(input, 50)).toBe(20); // ceil(2) = 2º de 10,20,30,40
      expect(input).toEqual([30, 10, 20, 40]);
    });
  });

  describe('parseOcrRunRows', () => {
    it('entrada que não é array: erro claro', () => {
      expect(() => parseOcrRunRows({})).toThrow('array');
      expect(() => parseOcrRunRows(null)).toThrow('array');
    });

    it('conta as linhas inválidas sem derrubar as válidas', () => {
      const parsed = parseOcrRunRows([
        row({}),
        null,
        'texto',
        { ocrJobId: 'sem-outcome' },
        row({ outcome: 'QUALQUER' }),
        row({ startedAt: 'nao-e-data' }),
        row({ queueWaitMs: -1 }),
        row({ totalMs: 'abc' }),
        row({ ocrJobId: '' }),
      ]);

      expect(parsed.rows).toHaveLength(1);
      expect(parsed.ignored).toBe(8);
    });

    it('custo: aceita número e texto de Decimal; vazio, inválido ou negativo viram null (nunca 0)', () => {
      const costs = parseOcrRunRows([
        row({ estimatedCostUsd: 0.0012 }),
        row({ estimatedCostUsd: '0.001200' }),
        row({ estimatedCostUsd: '' }),
        row({ estimatedCostUsd: 'abc' }),
        row({ estimatedCostUsd: -1 }),
        row({ estimatedCostUsd: null }),
        row({ estimatedCostUsd: 0 }),
      ]).rows.map((r) => r.costMicros);

      expect(costs).toEqual([1200, 1200, null, null, null, null, 0]);
    });
  });

  describe('buildOcrReport (conjunto de referência)', () => {
    const report = reportOf(reference);

    it('contagem de linhas: DISCARDED e inválidas ficam à parte', () => {
      expect(report.rows).toEqual({ valid: 8, ignored: 1, discarded: 1 });
    });

    it('execuções: 7 (sem DISCARDED), 4 concluídas, 2 retentativas, 1 falha final', () => {
      expect(report.executions).toEqual({
        total: 7,
        completed: 4,
        retryScheduled: 2,
        failedFinal: 1,
        successRate: 4 / 7,
      });
    });

    it('leituras: 5 terminais (4 concluídas, 1 falha), 1 em andamento, sucesso 80%, 1,2 execuções por leitura', () => {
      // (2 + 1 + 1 + 1 + 1) execuções / 5 leituras = 1,2
      expect(report.reads).toEqual({
        terminal: 5,
        completed: 4,
        failed: 1,
        inProgress: 1,
        successRate: 0.8,
        avgExecutionsPerRead: 1.2,
      });
    });

    it('espera na fila: todas (7) p50 300 e p95 30000; concluídas (4) p50 400 e p95 30000', () => {
      // todas ordenadas: 100,150,200,300,400,500,30000 -> p50 = 4º, p95 = 7º
      // concluídas: 200,400,500,30000 -> p50 = 2º, p95 = 4º
      expect(report.latencyMs.queueWait).toEqual({
        all: { samples: 7, p50: 300, p95: 30000 },
        completed: { samples: 4, p50: 400, p95: 30000 },
      });
    });

    it('OpenAI: valor null é ignorado (6 amostras), p50 4000 e p95 9000; concluídas p50 6000', () => {
      // todas sem o null da C: 1000,2000,4000,6000,8000,9000 -> p50 = 3º, p95 = 6º
      // concluídas: 4000,6000,8000,9000 -> p50 = 2º, p95 = 4º
      expect(report.latencyMs.openai).toEqual({
        all: { samples: 6, p50: 4000, p95: 9000 },
        completed: { samples: 4, p50: 6000, p95: 9000 },
      });
    });

    it('total da execução: todas p50 4100 e p95 9100; concluídas p50 6100 e p95 9100', () => {
      // todas: 100,1200,2100,4100,6100,8100,9100 -> p50 = 4º, p95 = 7º
      expect(report.latencyMs.total).toEqual({
        all: { samples: 7, p50: 4100, p95: 9100 },
        completed: { samples: 4, p50: 6100, p95: 9100 },
      });
    });

    it('falhas por categoria, da maior para a menor e em ordem alfabética no empate', () => {
      expect(report.failures).toEqual([
        { category: 'IMAGE_MISSING', executions: 1, finalReads: 1 },
        { category: 'INVALID_RESULT', executions: 1, finalReads: 0 },
        { category: 'TIMEOUT', executions: 1, finalReads: 0 },
      ]);
    });

    it('custo por execução: agrupado por modelo e versão; sem custo vira null, nunca 0', () => {
      // mini@v1: A1 300 + A2 1200 + B 800 = 2300 micro-USD em 3 de 4 execuções (D não tem custo)
      expect(report.executionCost).toEqual([
        {
          model: null,
          pricingVersion: null,
          executions: 1,
          executionsWithCost: 0,
          totalUsd: null,
        },
        {
          model: 'gpt-4.1-mini',
          pricingVersion: 'v1',
          executions: 4,
          executionsWithCost: 3,
          totalUsd: 0.0023,
        },
        {
          model: 'gpt-5-x',
          pricingVersion: 'v2',
          executions: 1,
          executionsWithCost: 1,
          totalUsd: 0.002,
        },
        {
          model: 'other',
          pricingVersion: null,
          executions: 1,
          executionsWithCost: 0,
          totalUsd: null,
        },
      ]);
    });

    it('custo por leitura concluída: inclui a tentativa que falhou com resposta; sem custo é null', () => {
      // mini@v1: leitura A = 300 + 1200 = 1500; leitura B = 800; média = 2300 / 2 = 1150 micro-USD
      expect(report.readCost).toEqual([
        {
          model: 'gpt-4.1-mini',
          pricingVersion: 'v1',
          completedReads: 2,
          completedReadsWithCost: 2,
          avgUsdPerCompletedRead: 0.00115,
        },
        {
          model: 'gpt-5-x',
          pricingVersion: 'v2',
          completedReads: 1,
          completedReadsWithCost: 1,
          avgUsdPerCompletedRead: 0.002,
        },
        {
          model: 'other',
          pricingVersion: null,
          completedReads: 1,
          completedReadsWithCost: 0,
          avgUsdPerCompletedRead: null,
        },
      ]);
    });

    it('período: da primeira à última execução válida', () => {
      expect(report.period).toEqual({
        firstStartedAt: t(0),
        lastStartedAt: t(7),
      });
    });

    it('a ordem das linhas na entrada não muda o resultado', () => {
      const shuffled = [...reference].reverse();
      expect(reportOf(shuffled)).toEqual(report);
    });
  });

  describe('casos de borda', () => {
    it('sem linhas: tudo zerado e as taxas e percentis são null (não 0 nem NaN)', () => {
      const empty = reportOf([]);

      expect(empty.executions.successRate).toBeNull();
      expect(empty.reads.successRate).toBeNull();
      expect(empty.reads.avgExecutionsPerRead).toBeNull();
      expect(empty.latencyMs.total.all).toEqual({
        samples: 0,
        p50: null,
        p95: null,
      });
      expect(empty.period).toEqual({
        firstStartedAt: null,
        lastStartedAt: null,
      });
      expect(empty.executionCost).toEqual([]);
      expect(empty.readCost).toEqual([]);
    });

    it('DISCARDED depois de uma retentativa não fecha a leitura: continua em andamento', () => {
      const r = reportOf([
        row({
          ocrJobId: 'J',
          attempt: 1,
          startedAt: t(0),
          outcome: 'RETRY_SCHEDULED',
          errorCategory: 'TRANSIENT',
        }),
        row({
          ocrJobId: 'J',
          attempt: 2,
          startedAt: t(1),
          outcome: 'DISCARDED',
        }),
      ]);

      expect(r.reads).toMatchObject({
        terminal: 0,
        inProgress: 1,
        successRate: null,
      });
      expect(r.executions.total).toBe(1);
    });

    it('job recriado (nova leitura da mesma conta, attempt volta a 1): duas leituras', () => {
      const r = reportOf([
        row({
          ocrJobId: 'R',
          attempt: 1,
          startedAt: t(0),
          outcome: 'FAILED_FINAL',
          errorCategory: 'CREDENTIAL',
        }),
        row({
          ocrJobId: 'R',
          attempt: 1,
          startedAt: t(30),
          outcome: 'COMPLETED',
        }),
      ]);

      expect(r.reads).toMatchObject({
        terminal: 2,
        completed: 1,
        failed: 1,
        inProgress: 0,
        successRate: 0.5,
      });
    });

    it('falha final sem categoria entra como SEM_CATEGORIA', () => {
      const r = reportOf([
        row({ outcome: 'FAILED_FINAL', errorCategory: null }),
      ]);

      expect(r.failures).toEqual([
        { category: 'SEM_CATEGORIA', executions: 1, finalReads: 1 },
      ]);
    });

    it('modelos e versões de preço diferentes na mesma leitura não são somados no mesmo custo', () => {
      const r = reportOf([
        row({
          ocrJobId: 'M',
          attempt: 1,
          startedAt: t(0),
          outcome: 'RETRY_SCHEDULED',
          errorCategory: 'INVALID_RESULT',
          estimatedCostUsd: 0.0001,
        }),
        row({
          ocrJobId: 'M',
          attempt: 2,
          startedAt: t(1),
          model: 'gpt-5-x',
          pricingVersion: 'v2',
          estimatedCostUsd: 0.002,
        }),
      ]);

      expect(r.readCost).toEqual([
        {
          model: 'gpt-5-x',
          pricingVersion: 'v2',
          completedReads: 1,
          completedReadsWithCost: 1,
          avgUsdPerCompletedRead: 0.002,
        },
      ]);
    });

    it('mesmo modelo com versões de preço diferentes (o preço mudou): custos em grupos separados', () => {
      const r = reportOf([
        row({
          ocrJobId: 'V1',
          startedAt: t(0),
          pricingVersion: 'v1',
          estimatedCostUsd: 0.001,
        }),
        row({
          ocrJobId: 'V2',
          startedAt: t(1),
          pricingVersion: 'v2',
          estimatedCostUsd: 0.003,
        }),
      ]);

      expect(r.readCost).toEqual([
        {
          model: 'gpt-4.1-mini',
          pricingVersion: 'v1',
          completedReads: 1,
          completedReadsWithCost: 1,
          avgUsdPerCompletedRead: 0.001,
        },
        {
          model: 'gpt-4.1-mini',
          pricingVersion: 'v2',
          completedReads: 1,
          completedReadsWithCost: 1,
          avgUsdPerCompletedRead: 0.003,
        },
      ]);
      expect(r.executionCost.map((c) => c.totalUsd)).toEqual([0.001, 0.003]);
    });

    it('falhas: a categoria com mais execuções vem primeiro; o empate segue a ordem alfabética', () => {
      const failed = (id: string, category: string, minute: number) =>
        row({
          ocrJobId: id,
          startedAt: t(minute),
          outcome: 'FAILED_FINAL',
          errorCategory: category,
        });

      const r = reportOf([
        failed('1', 'TRANSIENT', 0),
        failed('2', 'TRANSIENT', 1),
        failed('3', 'TRANSIENT', 2),
        failed('4', 'CREDENTIAL', 3),
        failed('5', 'CREDENTIAL', 4),
        failed('6', 'TIMEOUT', 5),
      ]);

      expect(r.failures.map((f) => [f.category, f.executions])).toEqual([
        ['TRANSIENT', 3],
        ['CREDENTIAL', 2],
        ['TIMEOUT', 1],
      ]);
    });

    it('soma de custos em micro-USD não acumula erro de ponto flutuante', () => {
      const r = reportOf(
        Array.from({ length: 10 }, (_, i) =>
          row({ ocrJobId: `P${i}`, startedAt: t(i), estimatedCostUsd: 0.1 }),
        ),
      );

      expect(r.executionCost[0].totalUsd).toBe(1); // 0,1 x 10 em float daria 0,9999999999999999
      expect(r.readCost[0].avgUsdPerCompletedRead).toBe(0.1);
    });
  });

  describe('compareOcrReports', () => {
    const bulk = (
      prefix: string,
      completed: number,
      failed: number,
      openaiMs: number,
      cost: number,
    ) => [
      ...Array.from({ length: completed }, (_, i) =>
        row({
          ocrJobId: `${prefix}${i}`,
          startedAt: t(i),
          queueWaitMs: 100,
          openaiMs,
          totalMs: openaiMs + 100,
          estimatedCostUsd: cost,
        }),
      ),
      ...Array.from({ length: failed }, (_, i) =>
        row({
          ocrJobId: `${prefix}f${i}`,
          startedAt: t(i),
          outcome: 'FAILED_FINAL',
          errorCategory: 'TRANSIENT',
          queueWaitMs: 100,
          openaiMs: 50,
          totalMs: 60,
        }),
      ),
    ];

    const baseline = reportOf(bulk('b', 30, 0, 1000, 0.001));
    const current = reportOf(bulk('c', 27, 3, 2000, 0.002));
    const find = (cmp: ReturnType<typeof compareOcrReports>, text: string) => {
      const found = cmp.lines.find((l) => l.metric.includes(text));
      if (!found) throw new Error(`linha não encontrada: ${text}`);
      return found;
    };

    it('diferença e variação: sucesso, tempos e custo', () => {
      const cmp = compareOcrReports(baseline, current);

      const success = find(cmp, 'sucesso por leitura');
      expect(success.baseline).toBe(1);
      expect(success.current).toBeCloseTo(0.9, 10);
      expect(success.delta).toBeCloseTo(-0.1, 10);
      expect(success.deltaPct).toBeCloseTo(-10, 8);

      const openaiP50 = find(cmp, 'OpenAI p50');
      expect([
        openaiP50.baseline,
        openaiP50.current,
        openaiP50.delta,
        openaiP50.deltaPct,
      ]).toEqual([1000, 2000, 1000, 100]);

      const totalP95 = find(cmp, 'Total p95');
      expect([totalP95.baseline, totalP95.current, totalP95.delta]).toEqual([
        1100, 2100, 1000,
      ]);
      expect(totalP95.deltaPct).toBeCloseTo(90.909090909, 6);

      const queue = find(cmp, 'Espera na fila p50');
      expect([queue.delta, queue.deltaPct]).toEqual([0, 0]);

      const cost = find(cmp, 'Custo médio');
      expect(cost.metric).toContain('gpt-4.1-mini @ v1');
      expect([cost.baseline, cost.current]).toEqual([0.001, 0.002]);
      expect(cost.delta).toBeCloseTo(0.001, 10);
      expect(cost.deltaPct).toBeCloseTo(100, 8);
    });

    it('amostra suficiente e mesmo modelo: nenhum aviso', () => {
      expect(compareOcrReports(baseline, current).warnings).toEqual([]);
    });

    it('amostra pequena e modelos diferentes: avisa, e o custo só aparece dentro do mesmo modelo', () => {
      const cmp = compareOcrReports(reportOf(reference), current);

      expect(cmp.warnings).toEqual([
        `baseline tem 5 leituras terminais (menos de ${MIN_READS_FOR_COMPARISON}): a diferença pode ser ruído.`,
        'baseline tem 4 execuções concluídas (menos de 20): o p95 é praticamente o máximo.',
        'baseline e atual têm conjuntos diferentes de modelo e versão de preço: o custo só é comparável dentro do mesmo modelo e versão.',
      ]);

      const costLines = cmp.lines.filter((l) =>
        l.metric.startsWith('Custo médio'),
      );
      expect(costLines.map((l) => l.metric.replace(/^.*\[|\]$/g, ''))).toEqual([
        'gpt-4.1-mini @ v1',
        'gpt-5-x @ v2',
        'other @ sem versão de preço',
      ]);
      // só existem no baseline: a diferença é null, não 0
      expect(costLines[1]).toMatchObject({
        current: null,
        delta: null,
        deltaPct: null,
      });
      expect(costLines[2]).toMatchObject({
        baseline: null,
        current: null,
        delta: null,
      });
    });

    it('29 leituras terminais ainda avisam (limite exato: 30 não avisa)', () => {
      const cmp = compareOcrReports(
        reportOf(bulk('x', 29, 0, 1000, 0.001)),
        current,
      );

      expect(cmp.warnings).toEqual([
        `baseline tem 29 leituras terminais (menos de ${MIN_READS_FOR_COMPARISON}): a diferença pode ser ruído.`,
      ]);
      expect(compareOcrReports(baseline, current).warnings).toEqual([]);
    });

    it('modelo novo só no atual: aparece com baseline null e avisa que o conjunto mudou', () => {
      const withNewModel = reportOf([
        ...bulk('n', 30, 0, 1000, 0.001),
        row({
          ocrJobId: 'novo',
          startedAt: t(40),
          model: 'gpt-5-x',
          pricingVersion: 'v2',
          estimatedCostUsd: 0.002,
        }),
      ]);

      const cmp = compareOcrReports(baseline, withNewModel);

      const costLines = cmp.lines.filter((l) =>
        l.metric.startsWith('Custo médio'),
      );
      expect(costLines.map((l) => l.metric.replace(/^.*\[|\]$/g, ''))).toEqual([
        'gpt-4.1-mini @ v1',
        'gpt-5-x @ v2',
      ]);
      expect(costLines[1]).toMatchObject({
        baseline: null,
        current: 0.002,
        delta: null,
        deltaPct: null,
      });
      expect(cmp.warnings).toEqual([
        'baseline e atual têm conjuntos diferentes de modelo e versão de preço: o custo só é comparável dentro do mesmo modelo e versão.',
      ]);
    });

    it('faltando um lado a diferença é null, e baseline 0 não gera variação percentual', () => {
      const cmp = compareOcrReports(reportOf([]), current);
      const success = find(cmp, 'sucesso por leitura');
      expect(success).toMatchObject({
        baseline: null,
        delta: null,
        deltaPct: null,
      });

      const zero = compareOcrReports(reportOf(bulk('z', 0, 30, 0, 0)), current);
      const rate = find(zero, 'sucesso por leitura');
      expect(rate.baseline).toBe(0);
      expect(rate.delta).toBeCloseTo(0.9, 10);
      expect(rate.deltaPct).toBeNull();
    });
  });

  describe('parseSavedOcrReport (baseline salvo com --save)', () => {
    it('aceita o JSON de um relatório gerado e comparável (ida e volta por texto)', () => {
      const original = reportOf(reference);

      const saved = parseSavedOcrReport(JSON.parse(JSON.stringify(original)));

      expect(saved).toEqual(original);
      expect(() => compareOcrReports(saved, original)).not.toThrow();
    });

    it.each([
      ['null', null],
      ['objeto vazio', {}],
      ['array', []],
      ['sem latencyMs', { rows: {}, executions: {}, reads: {} }],
      [
        'failures que não é array',
        {
          rows: {},
          executions: {},
          reads: {},
          latencyMs: { queueWait: {}, openai: {}, total: {} },
          failures: {},
          executionCost: [],
          readCost: [],
        },
      ],
    ])('recusa %s com mensagem clara', (_nome, input) => {
      expect(() => parseSavedOcrReport(input)).toThrow(
        'não parece um relatório de OCR',
      );
    });
  });

  describe('texto em Markdown', () => {
    it('relatório: percentuais, tempos e "—" no lugar de null', () => {
      const text = renderOcrReportMarkdown(reportOf(reference));

      expect(text).toContain('| Taxa de sucesso por leitura | 80.0% |');
      expect(text).toContain('| Taxa de sucesso por execução | 57.1% |');
      expect(text).toContain('| Execuções por leitura (média) | 1.20 |');
      expect(text).toContain(
        '| Espera na fila | 7 | 300 | 30000 | 4 | 400 | 30000 |',
      );
      expect(text).toContain('| gpt-4.1-mini @ v1 | 2 | 2 | 0.001150 |');
      expect(text).toContain('| other @ sem versão de preço | 1 | 0 | — |');
      expect(text).toContain('| IMAGE_MISSING | 1 | 1 |');
    });

    it('relatório vazio: sem "NaN", "undefined" nem "null" no texto', () => {
      const text = renderOcrReportMarkdown(reportOf([]));

      expect(text).not.toMatch(/NaN|undefined|null/);
      expect(text).toContain('Nenhuma execução com falha.');
    });

    it('comparação: sinais, unidades e avisos', () => {
      const baseline = reportOf(
        Array.from({ length: 30 }, (_, i) =>
          row({
            ocrJobId: `b${i}`,
            startedAt: t(i),
            openaiMs: 1000,
            totalMs: 1100,
            estimatedCostUsd: 0.001,
          }),
        ),
      );
      const current = reportOf([
        ...Array.from({ length: 27 }, (_, i) =>
          row({
            ocrJobId: `c${i}`,
            startedAt: t(i),
            openaiMs: 2000,
            totalMs: 2100,
            estimatedCostUsd: 0.002,
          }),
        ),
        ...Array.from({ length: 3 }, (_, i) =>
          row({
            ocrJobId: `cf${i}`,
            startedAt: t(i),
            outcome: 'FAILED_FINAL',
            errorCategory: 'TRANSIENT',
          }),
        ),
      ]);

      const text = renderComparisonMarkdown(
        compareOcrReports(baseline, current),
      );

      expect(text).toContain(
        '| Taxa de sucesso por leitura | 100.0% | 90.0% | -10.0 p.p. | -10.0% |',
      );
      expect(text).toContain(
        '| OpenAI p50 (concluídas) | 1000 ms | 2000 ms | +1000 ms | +100.0% |',
      );
      expect(text).toContain('| 0.001000 | 0.002000 | +0.001000 | +100.0% |');
      expect(text).not.toContain('Avisos:');

      const small = renderComparisonMarkdown(
        compareOcrReports(reportOf(reference), current),
      );
      expect(small).toContain('Avisos:');
      expect(small).toContain('— | — |');
      expect(small).not.toMatch(/NaN|undefined|null/);
    });
  });
});
