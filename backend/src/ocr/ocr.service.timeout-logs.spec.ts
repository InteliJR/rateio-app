import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { APIConnectionError, APIConnectionTimeoutError } from 'openai';
import {
  OcrService,
  OPENAI_TIMEOUT_MS_DEFAULT,
  readOpenAiTimeoutMs,
} from './ocr.service';
import { OcrResultDto } from './dto/ocr-result.dto';
import { OcrQueueService } from './ocr-queue.service';
import { classifyOcrError } from './ocr-error-category';

/**
 * Semana 5 (P1), task 2: timeout e retentativas do cliente da OpenAI, e logs sem
 * conteúdo. Usa o cliente REAL do SDK com o `fetch` trocado por um mock (o SDK guarda
 * o fetch em `client.fetch`), então prova o número real de chamadas HTTP e o timeout
 * real. Não prova: a OpenAI de verdade, nem o tempo real de uma leitura (o padrão de
 * 30 s é provisório, ver OPENAI_TIMEOUT_MS_DEFAULT).
 */
describe('OcrService: timeout, retentativas e logs sem conteúdo', () => {
  const SIGNED_URL =
    'https://bucket.s3.amazonaws.com/bills/u1/foto.jpg?X-Amz-Signature=ASSINATURASECRETA';
  const LEAKS = [
    'ASSINATURASECRETA',
    'X-Amz-Signature',
    'bucket.s3.amazonaws.com',
    'MENSAGEMCRUA',
    // Marcador curto: a mensagem do SyntaxError só cita ~10 caracteres da resposta
    'SEGREDO1',
    'Prato Secreto',
    '98765.43',
  ];

  const originalEnv = {
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
    timeout: process.env.OPENAI_TIMEOUT_MS,
    lock: process.env.OCR_QUEUE_LOCK_TIMEOUT_MS,
  };

  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  let consoleSpies: jest.SpyInstance[];
  let loggerSpies: jest.SpyInstance[];

  /** Tudo que o serviço escreveu em console e Logger, como texto. */
  const allOutput = () =>
    [...consoleSpies, ...loggerSpies]
      .flatMap((spy) => spy.mock.calls)
      .map((args) =>
        args
          .map((arg: unknown) =>
            typeof arg === 'string' ? arg : JSON.stringify(arg),
          )
          .join(' '),
      )
      .join('\n');

  const expectNoLeak = () => {
    const output = allOutput();
    for (const secret of LEAKS) {
      expect(output).not.toContain(secret);
    }
  };

  const json = (status: number, body: object = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  /** Serviço com o cliente real do SDK e o fetch e o sleep substituídos. */
  const buildService = (fetchMock: jest.Mock): any => {
    const service: any = new OcrService();
    service.openaiClient.fetch = fetchMock;
    service.sleep = jest.fn().mockResolvedValue(undefined);
    return service;
  };

  const completion = (content: string) =>
    json(200, {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-4.1-mini',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4.1-mini';
    delete process.env.OPENAI_TIMEOUT_MS;
    delete process.env.OCR_QUEUE_LOCK_TIMEOUT_MS;
    consoleSpies = [
      jest.spyOn(console, 'log').mockImplementation(),
      jest.spyOn(console, 'warn').mockImplementation(),
      jest.spyOn(console, 'error').mockImplementation(),
    ];
    loggerSpies = [
      jest.spyOn(Logger.prototype, 'log').mockImplementation(),
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(),
      jest.spyOn(Logger.prototype, 'error').mockImplementation(),
    ];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restore('OPENAI_API_KEY', originalEnv.key);
    restore('OPENAI_MODEL', originalEnv.model);
    restore('OPENAI_TIMEOUT_MS', originalEnv.timeout);
    restore('OCR_QUEUE_LOCK_TIMEOUT_MS', originalEnv.lock);
  });

  describe('F1: timeout configurável e sem retentativa escondida do SDK', () => {
    it('sem OPENAI_TIMEOUT_MS: padrão de 30 s e maxRetries 0 no cliente real', () => {
      const client = (new OcrService() as any).openaiClient;

      expect(OPENAI_TIMEOUT_MS_DEFAULT).toBe(30000);
      expect(client.timeout).toBe(30000);
      expect(client.maxRetries).toBe(0);
    });

    it('OPENAI_TIMEOUT_MS válido é usado no cliente', () => {
      process.env.OPENAI_TIMEOUT_MS = '12000';

      expect((new OcrService() as any).openaiClient.timeout).toBe(12000);
    });

    it.each([undefined, '', 'abc', '0', '-5', 'NaN', 'Infinity'])(
      'OPENAI_TIMEOUT_MS %p volta ao padrão',
      (raw) => {
        expect(readOpenAiTimeoutMs(raw)).toBe(OPENAI_TIMEOUT_MS_DEFAULT);
      },
    );

    it('valor decimal é arredondado para baixo', () => {
      expect(readOpenAiTimeoutMs('1500.9')).toBe(1500);
    });

    it('erro 500 persistente: exatamente 3 chamadas HTTP (e não 9 com as retentativas do SDK)', async () => {
      const fetchMock = jest.fn().mockImplementation(async () => json(500));
      const service = buildService(fetchMock);

      await expect(service.processImage(SIGNED_URL)).rejects.toBeDefined();

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('erro 400: 1 única chamada, sem retentativa', async () => {
      const fetchMock = jest.fn().mockImplementation(async () => json(400));
      const service = buildService(fetchMock);

      await expect(service.processImage(SIGNED_URL)).rejects.toBeDefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('chamada que nunca responde é abortada pelo timeout configurado e classificada TIMEOUT', async () => {
      process.env.OPENAI_TIMEOUT_MS = '40';
      const fetchMock = jest.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            // Como o fetch de verdade: ao abortar, rejeita com name 'AbortError'.
            // (Error comum com o nome: no Jest o DOMException não é instanceof Error
            // e o SDK não o reconheceria.)
            init.signal.addEventListener('abort', () =>
              reject(
                Object.assign(new Error('abortado'), { name: 'AbortError' }),
              ),
            );
          }),
      );
      const service = buildService(fetchMock);

      const started = Date.now();
      const error = await service.processImage(SIGNED_URL).catch((e: any) => e);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(error).toBeDefined();
      expect(classifyOcrError(error).category).toBe('TIMEOUT');
    });

    it('pior caso de uma execução (3 chamadas no timeout + esperas máximas) cabe no lock padrão da fila', () => {
      const service: any = new OcrService();
      const Queue = OcrQueueService as unknown as new (
        ...deps: unknown[]
      ) => any;
      const queue = new Queue({}, {}, {}, {}, {});

      const worstCaseMs =
        service.maxRetries * service.openaiClient.timeout +
        (service.maxRetries - 1) * service.maxDelayMs;

      expect(queue.lockTimeoutMs).toBe(120000);
      expect(worstCaseMs).toBeLessThan(queue.lockTimeoutMs);
    });
  });

  describe('F2: logs sem URL assinada, mensagem crua nem conteúdo da nota', () => {
    const rawBody = {
      error: {
        message: `MENSAGEMCRUA com ${SIGNED_URL}`,
        code: 'algum_codigo',
      },
    };

    it.each([500, 429, 401, 403, 400])(
      'erro %i da OpenAI com URL e mensagem no corpo: nada vaza',
      async (status) => {
        const fetchMock = jest
          .fn()
          .mockImplementation(async () => json(status, rawBody));
        const service = buildService(fetchMock);

        await expect(service.processImage(SIGNED_URL)).rejects.toBeDefined();

        expect(allOutput()).toContain('OPENAI_API_ERROR');
        expectNoLeak();
      },
    );

    it('falha após todas as tentativas: o log mantém tentativa, classe, status e código', async () => {
      const fetchMock = jest.fn().mockImplementation(async () => json(500));
      const service = buildService(fetchMock);

      await expect(service.processImage(SIGNED_URL)).rejects.toBeDefined();

      const output = allOutput();
      expect(output).toContain('[OCR_RETRY]');
      expect(output).toContain('"attempt": 3');
      expect(output).toContain('"status": "falhou_apos_todas_tentativas"');
      expect(output).toContain('"errorType": "InternalServerError"');
      expect(output).toContain('"status": 500');
      expectNoLeak();
    });

    it('erro de conexão com URL na mensagem: nada vaza', async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValue(new TypeError(`MENSAGEMCRUA ${SIGNED_URL}`));
      const service = buildService(fetchMock);

      const error = await service.processImage(SIGNED_URL).catch((e: any) => e);

      expect(error).toBeDefined();
      expectNoLeak();
    });

    it('erros de conexão e de timeout instanciados direto: nada vaza', async () => {
      const connection = new APIConnectionError({
        message: `MENSAGEMCRUA ${SIGNED_URL}`,
        cause: new Error(`MENSAGEMCRUA ${SIGNED_URL}`),
      });
      const timeout = new APIConnectionTimeoutError({
        message: `MENSAGEMCRUA ${SIGNED_URL}`,
      });

      for (const failure of [connection, timeout]) {
        const fetchMock = jest.fn().mockRejectedValue(failure);
        const service = buildService(fetchMock);
        await expect(service.processImage(SIGNED_URL)).rejects.toBeDefined();
      }

      expectNoLeak();
    });

    it('erro genérico (não é da API) com URL e pilha: nada vaza', async () => {
      const service: any = new OcrService();
      service.sleep = jest.fn().mockResolvedValue(undefined);
      service.openaiClient = {
        chat: {
          completions: {
            create: jest
              .fn()
              .mockRejectedValue(new Error(`MENSAGEMCRUA ${SIGNED_URL}`)),
          },
        },
      };

      await expect(service.processImage(SIGNED_URL)).rejects.toBeDefined();

      expect(allOutput()).toContain('OCR_GENERIC_ERROR');
      expectNoLeak();
    });

    it('resposta que não é JSON (a mensagem do SyntaxError cita um trecho): nada vaza', async () => {
      const fetchMock = jest
        .fn()
        .mockImplementation(async () =>
          completion(
            'SEGREDO1 MENSAGEMCRUA Prato Secreto 98765.43 não é json {',
          ),
        );
      const service = buildService(fetchMock);

      const result = await service.processImage(SIGNED_URL);

      expect(result.source).toBe('TEXT_FALLBACK');
      expect(allOutput()).toContain('JSON_INVALID');
      expectNoLeak();
    });

    it('erro inesperado ao processar a resposta (PARSE_ERROR): nada vaza', async () => {
      jest
        .spyOn(OcrResultDto, 'fromOpenAiResponse')
        .mockRejectedValue(new Error(`MENSAGEMCRUA ${SIGNED_URL}`));
      const fetchMock = jest
        .fn()
        .mockImplementation(async () => completion('{"items": []}'));
      const service = buildService(fetchMock);

      const result = await service.processImage(SIGNED_URL);

      expect(result.source).toBe('TEXT_FALLBACK');
      expect(allOutput()).toContain('PARSE_ERROR');
      expectNoLeak();
    });

    it('item inválido dentro de items (erro aninhado com o item inteiro como valor): só campo e regra vão para o log', async () => {
      const fetchMock = jest.fn().mockImplementation(async () =>
        completion(
          JSON.stringify({
            items: [
              // Sem preços: continua inválido depois da normalização do DTO
              { name: 'Prato Secreto', quantity: 1 },
            ],
            totalAmount: 98765.43,
          }),
        ),
      );
      const service = buildService(fetchMock);

      await service.processImage(SIGNED_URL);

      const output = allOutput();
      expect(output).toContain('VALIDATION_ERROR');
      expect(output).toContain('"children"');
      expectNoLeak();
    });

    it('JSON que não passa na validação (nomes e valores da nota): só campo e regra vão para o log', async () => {
      const fetchMock = jest.fn().mockImplementation(async () =>
        completion(
          JSON.stringify({
            items: [
              {
                name: 'Prato Secreto',
                quantity: 1,
                unitPrice: 10,
                totalPrice: 10,
              },
            ],
            totalAmount: 98765.43,
          }),
        ),
      );
      const service = buildService(fetchMock);

      const result = await service.processImage(SIGNED_URL);

      expect(result.source).toBe('JSON_UNVALIDATED');
      const output = allOutput();
      expect(output).toContain('Erros de validação:');
      expect(output).toContain('VALIDATION_ERROR');
      expect(output).toContain('"rules"');
      expectNoLeak();
    });
  });
});
