import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { OcrService } from './ocr.service';

/**
 * Cobre a linha OCR_METRIC (stage "openai") emitida por processImage: campos,
 * contagem de chamadas, tokens ausentes e ausência de dados sensíveis.
 * O cliente OpenAI e o sleep do retry são trocados por mocks via cast em
 * campos privados, sem alterar o código de produção.
 */
describe('OcrService OCR_METRIC (openai)', () => {
  const SIGNED_URL =
    'https://bucket.s3.amazonaws.com/bills/u1/foto.jpg?X-Amz-Signature=ASSINATURASECRETA';
  const ITEM_NAME = 'Picanha Secreta';
  const ESTABLISHMENT = 'Bar do Sigilo';
  const RESPONSE_CONTENT = JSON.stringify({
    establishmentName: ESTABLISHMENT,
    items: [
      {
        name: ITEM_NAME,
        quantity: 1,
        unitPrice: 10,
        totalPrice: 10,
      },
    ],
    totalAmount: 10,
  });
  const OPENAI_KEYS = [
    'attempts',
    'completionTokens',
    'jobId',
    'model',
    'openaiMs',
    'promptTokens',
    'stage',
  ];
  const FORBIDDEN = [
    SIGNED_URL,
    'amazonaws',
    'ASSINATURASECRETA',
    ITEM_NAME,
    ESTABLISHMENT,
  ];

  const originalEnv = {
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  };

  let create: jest.Mock;
  let logSpy: jest.SpyInstance;

  const buildService = (): any => {
    const service: any = new OcrService();
    service.openaiClient = { chat: { completions: { create } } };
    service.sleep = jest.fn().mockResolvedValue(undefined);
    return service;
  };

  const completion = (usage?: unknown) => ({
    choices: [{ message: { content: RESPONSE_CONTENT } }],
    ...(usage ? { usage } : {}),
  });

  const metricLines = (): string[] =>
    logSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.startsWith('OCR_METRIC '));

  const parseMetric = (line: string) =>
    JSON.parse(line.replace(/^OCR_METRIC /, ''));

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'modelo-de-teste';
    create = jest.fn();

    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalEnv.key;
    if (originalEnv.model === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalEnv.model;
  });

  it('emite uma linha openai com modelo, duração, chamadas e tokens', async () => {
    create.mockResolvedValue(
      completion({ prompt_tokens: 1200, completion_tokens: 340 }),
    );

    await buildService().processImage(SIGNED_URL, { jobId: 'job-1' });

    const lines = metricLines();
    expect(lines).toHaveLength(1);

    const metric = parseMetric(lines[0]);
    expect(Object.keys(metric).sort()).toEqual(OPENAI_KEYS);
    expect(metric).toMatchObject({
      stage: 'openai',
      jobId: 'job-1',
      model: 'modelo-de-teste',
      attempts: 1,
      promptTokens: 1200,
      completionTokens: 340,
    });
    expect(metric.openaiMs).toBeGreaterThanOrEqual(0);
    for (const forbidden of FORBIDDEN) {
      expect(lines[0]).not.toContain(forbidden);
    }
  });

  it('usa null para jobId e tokens quando ausentes', async () => {
    create.mockResolvedValue(completion());

    await buildService().processImage(SIGNED_URL);

    const metric = parseMetric(metricLines()[0]);
    expect(metric).toMatchObject({
      jobId: null,
      promptTokens: null,
      completionTokens: null,
    });
  });

  it('conta as chamadas feitas pelo retry próprio e emite só uma linha', async () => {
    create
      .mockRejectedValueOnce(new Error('erro transitório'))
      .mockResolvedValueOnce(
        completion({ prompt_tokens: 10, completion_tokens: 5 }),
      );

    await buildService().processImage(SIGNED_URL, { jobId: 'job-2' });

    expect(create).toHaveBeenCalledTimes(2);
    const lines = metricLines();
    expect(lines).toHaveLength(1);
    expect(parseMetric(lines[0])).toMatchObject({
      jobId: 'job-2',
      attempts: 2,
    });
  });

  it('não emite a linha openai quando a chamada falha (limitação conhecida)', async () => {
    create.mockRejectedValue(
      Object.assign(new Error('chave inválida'), { status: 401 }),
    );

    await expect(
      buildService().processImage(SIGNED_URL, { jobId: 'job-3' }),
    ).rejects.toBeDefined();

    expect(metricLines()).toHaveLength(0);
  });
});
