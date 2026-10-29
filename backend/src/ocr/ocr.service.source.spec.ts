import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { isUsableOcrResult } from './ocr-credits';

/**
 * Origem do resultado (`source`) devolvida pela OcrService, com o cliente da
 * OpenAI trocado por um mock. Só confere o campo e sua consequência para o
 * crédito; o parsing em si continua coberto pelos specs existentes.
 */
describe('OcrService: origem do resultado (source)', () => {
  let create: jest.Mock;

  const build = (): any => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4.1-mini';
    const service: any = new OcrService();
    service.openaiClient = { chat: { completions: { create } } };
    service.sleep = jest.fn().mockResolvedValue(undefined);
    return service;
  };

  const reply = (content: string) =>
    create.mockResolvedValue({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

  beforeEach(() => {
    create = jest.fn();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('JSON que passa na validação: MODEL_JSON e utilizável', async () => {
    reply(
      JSON.stringify({
        items: [{ name: 'Chopp', quantity: 2, unitPrice: 5, totalPrice: 10 }],
        totalAmount: 10,
      }),
    );

    const result = await build().processImage('https://img.test/a.jpg');

    expect(result.source).toBe('MODEL_JSON');
    expect(isUsableOcrResult(result)).toBe(true);
  });

  it('soma dos itens diferente do total: JSON_UNVALIDATED e NÃO utilizável', async () => {
    reply(
      JSON.stringify({
        items: [{ name: 'Chopp', quantity: 2, unitPrice: 5, totalPrice: 10 }],
        totalAmount: 99,
      }),
    );

    const result = await build().processImage('https://img.test/a.jpg');

    expect(result.source).toBe('JSON_UNVALIDATED');
    expect(result.items).toHaveLength(1);
    expect(isUsableOcrResult(result)).toBe(false);
  });

  it('resposta que não é JSON: TEXT_FALLBACK e NÃO utilizável', async () => {
    reply('Bar do Teste\nChopp 10,00\nTOTAL: 10,00');

    const result = await build().processImage('https://img.test/a.jpg');

    expect(result.source).toBe('TEXT_FALLBACK');
    expect(isUsableOcrResult(result)).toBe(false);
  });
});
