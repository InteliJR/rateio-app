import {
  OCR_PRICING_TABLES,
  PricingTable,
  estimateOcrCost,
  findPricingTable,
} from './ocr-pricing';

/**
 * Estimativa de custo. Usa tabelas de teste injetadas (os testes não dependem dos
 * preços reais, que devem ser confirmados na página oficial antes do merge).
 * Não prova: que os preços da tabela de produção estão corretos.
 */
describe('estimateOcrCost', () => {
  const table = (
    version: string,
    effectiveFrom: string,
    models: PricingTable['models'],
  ): PricingTable => ({
    version,
    effectiveFrom,
    currency: 'USD',
    source: 'fonte de teste',
    models,
  });

  const OLD = table('v-antiga', '2026-01-01', {
    'modelo-a': { inputPerMillion: 1, outputPerMillion: 2 },
  });
  const NEW = table('v-nova', '2026-06-01', {
    'modelo-a': { inputPerMillion: 10, outputPerMillion: 20 },
  });
  const AT = new Date('2026-07-15T12:00:00Z');

  it('calcula pelo preço por milhão de tokens e guarda a versão da tabela', () => {
    const result = estimateOcrCost(
      { model: 'modelo-a', promptTokens: 1000, completionTokens: 500, at: AT },
      [OLD],
    );

    // (1000 * 1 + 500 * 2) / 1.000.000
    expect(result).toEqual({
      estimatedCostUsd: 0.002,
      pricingVersion: 'v-antiga',
    });
  });

  it('arredonda para 6 casas (a precisão da coluna)', () => {
    const result = estimateOcrCost(
      { model: 'modelo-a', promptTokens: 1, completionTokens: 1, at: AT },
      [
        table('v', '2026-01-01', {
          'modelo-a': { inputPerMillion: 0.3333333, outputPerMillion: 0 },
        }),
      ],
    );

    expect(result.estimatedCostUsd).toBe(0);
    const bigger = estimateOcrCost(
      { model: 'modelo-a', promptTokens: 1234, completionTokens: 0, at: AT },
      [
        table('v', '2026-01-01', {
          'modelo-a': { inputPerMillion: 0.3333333, outputPerMillion: 0 },
        }),
      ],
    );
    expect(bigger.estimatedCostUsd).toBe(0.000411);
  });

  it('usa a tabela vigente na data, não a mais nova nem a mais antiga', () => {
    const base = {
      model: 'modelo-a',
      promptTokens: 1_000_000,
      completionTokens: 0,
    };

    expect(
      estimateOcrCost({ ...base, at: new Date('2026-03-01T00:00:00Z') }, [
        NEW,
        OLD,
      ]),
    ).toEqual({ estimatedCostUsd: 1, pricingVersion: 'v-antiga' });
    expect(
      estimateOcrCost({ ...base, at: new Date('2026-06-01T00:00:00Z') }, [
        OLD,
        NEW,
      ]),
    ).toEqual({ estimatedCostUsd: 10, pricingVersion: 'v-nova' });
  });

  it('antes da primeira vigência não há estimativa', () => {
    expect(
      estimateOcrCost(
        {
          model: 'modelo-a',
          promptTokens: 10,
          completionTokens: 10,
          at: new Date('2025-12-31T23:59:59Z'),
        },
        [OLD],
      ),
    ).toEqual({ estimatedCostUsd: null, pricingVersion: null });
  });

  it('modelo fora da tabela vigente: null (nunca 0), sem misturar com tabela antiga', () => {
    const onlyOld = table('v-antiga', '2026-01-01', {
      'modelo-a': { inputPerMillion: 1, outputPerMillion: 2 },
      'modelo-b': { inputPerMillion: 5, outputPerMillion: 5 },
    });
    const result = estimateOcrCost(
      { model: 'modelo-b', promptTokens: 100, completionTokens: 100, at: AT },
      [onlyOld, NEW],
    );

    expect(result).toEqual({ estimatedCostUsd: null, pricingVersion: null });
  });

  it.each([
    ['sem tokens de entrada', { promptTokens: null, completionTokens: 10 }],
    ['sem tokens de saída', { promptTokens: 10, completionTokens: null }],
    [
      'sem nenhum token',
      { promptTokens: undefined, completionTokens: undefined },
    ],
    ['tokens negativos', { promptTokens: -1, completionTokens: 10 }],
    ['tokens inválidos', { promptTokens: Number.NaN, completionTokens: 10 }],
  ])('%s: null (e nunca 0)', (_name, tokens) => {
    const result = estimateOcrCost({ model: 'modelo-a', at: AT, ...tokens }, [
      OLD,
    ]);

    expect(result.estimatedCostUsd).toBeNull();
    expect(result.pricingVersion).toBeNull();
  });

  it('sem modelo: null', () => {
    expect(
      estimateOcrCost(
        { model: null, promptTokens: 1, completionTokens: 1, at: AT },
        [OLD],
      ).estimatedCostUsd,
    ).toBeNull();
  });

  it('zero tokens é custo 0 de verdade (diferente de "desconhecido")', () => {
    expect(
      estimateOcrCost(
        { model: 'modelo-a', promptTokens: 0, completionTokens: 0, at: AT },
        [OLD],
      ),
    ).toEqual({ estimatedCostUsd: 0, pricingVersion: 'v-antiga' });
  });

  it('findPricingTable ignora vigência inválida', () => {
    expect(findPricingTable(AT, [table('v', 'data-ruim', {})])).toBeNull();
  });

  describe('tabela de produção', () => {
    it('é versionada e datada, com moeda e fonte', () => {
      expect(OCR_PRICING_TABLES.length).toBeGreaterThan(0);

      for (const entry of OCR_PRICING_TABLES) {
        expect(entry.version).toMatch(/\S/);
        expect(entry.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.currency).toBe('USD');
        expect(entry.source).toMatch(/\S/);
      }
    });

    it('versões e vigências não se repetem', () => {
      const versions = OCR_PRICING_TABLES.map((entry) => entry.version);
      const starts = OCR_PRICING_TABLES.map((entry) => entry.effectiveFrom);

      expect(new Set(versions).size).toBe(versions.length);
      expect(new Set(starts).size).toBe(starts.length);
    });
  });
});
