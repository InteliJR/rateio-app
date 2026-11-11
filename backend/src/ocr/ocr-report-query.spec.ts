import {
  OCR_REPORT_SELECT,
  OcrRunMetricReader,
  loadOcrRunRows,
} from './ocr-report-query';
import { buildOcrReport, parseOcrRunRows } from './ocr-report';

/**
 * A consulta de leitura das métricas, com um cliente FALSO que só tem `findMany`.
 * Não prova: o SQL que o Prisma gera nem o comportamento de um Postgres real.
 */
describe('loadOcrRunRows', () => {
  const buildClient = (rows: unknown[] = []) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const client = {
      ocrRunMetric: { findMany },
    } as unknown as OcrRunMetricReader;
    return { client, findMany };
  };

  it('lê só as colunas de medição: nada de billId, userId, mensagem de erro ou texto', async () => {
    const { client, findMany } = buildClient();

    await loadOcrRunRows(client);

    const args = findMany.mock.calls[0][0];
    expect(Object.keys(args.select).sort()).toEqual(
      [
        'attempt',
        'errorCategory',
        'model',
        'ocrJobId',
        'openaiMs',
        'outcome',
        'pricingVersion',
        'queueWaitMs',
        'startedAt',
        'totalMs',
        'estimatedCostUsd',
      ].sort(),
    );
    for (const forbidden of [
      'billId',
      'userId',
      'errorCode',
      'providerRequestId',
      'lastError',
      'rawText',
      'imageUrl',
    ]) {
      expect(args.select).not.toHaveProperty(forbidden);
    }
    expect(args.select).toBe(OCR_REPORT_SELECT);
  });

  it('sem período: sem filtro, em ordem de início', async () => {
    const { client, findMany } = buildClient();

    await loadOcrRunRows(client);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({});
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ startedAt: 'asc' });
  });

  it('since é inclusivo (gte) e until é exclusivo (lt)', async () => {
    const since = new Date('2026-11-01T00:00:00Z');
    const until = new Date('2026-11-08T00:00:00Z');

    const both = buildClient();
    await loadOcrRunRows(both.client, { since, until });
    expect(both.findMany.mock.calls[0][0].where).toEqual({
      startedAt: { gte: since, lt: until },
    });

    const onlySince = buildClient();
    await loadOcrRunRows(onlySince.client, { since });
    expect(onlySince.findMany.mock.calls[0][0].where).toEqual({
      startedAt: { gte: since },
    });

    const onlyUntil = buildClient();
    await loadOcrRunRows(onlyUntil.client, { until });
    expect(onlyUntil.findMany.mock.calls[0][0].where).toEqual({
      startedAt: { lt: until },
    });
  });

  it('o Decimal do Prisma vira texto, e custo ausente continua null (não 0)', async () => {
    const decimal = { toString: () => '0.001200' };
    const { client } = buildClient([
      { ocrJobId: 'A', estimatedCostUsd: decimal },
      { ocrJobId: 'B', estimatedCostUsd: null },
    ]);

    const rows = await loadOcrRunRows(client);

    expect(rows).toEqual([
      { ocrJobId: 'A', estimatedCostUsd: '0.001200' },
      { ocrJobId: 'B', estimatedCostUsd: null },
    ]);
  });

  it('o resultado alimenta o relatório: custo em texto é lido como 1200 micro-USD', async () => {
    const { client } = buildClient([
      {
        ocrJobId: 'A',
        attempt: 1,
        startedAt: new Date('2026-11-01T10:00:00Z'),
        outcome: 'COMPLETED',
        errorCategory: null,
        model: 'gpt-4.1-mini',
        pricingVersion: 'v1',
        queueWaitMs: 100,
        openaiMs: 4000,
        totalMs: 4100,
        estimatedCostUsd: { toString: () => '0.001200' },
      },
    ]);

    const report = buildOcrReport(
      parseOcrRunRows(await loadOcrRunRows(client)),
    );

    expect(report.reads.completed).toBe(1);
    expect(report.readCost[0].avgUsdPerCompletedRead).toBe(0.0012);
  });
});
