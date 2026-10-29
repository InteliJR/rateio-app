import 'reflect-metadata';
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APIConnectionTimeoutError, APIError } from 'openai';
import { OcrService } from './ocr.service';
import { classifyOcrError } from './ocr-error-category';
import { OpenAiCallMetrics } from './ocr-run-metrics';

/**
 * Erros e medição da OcrService com o cliente da OpenAI trocado por um mock (cast em
 * campo privado, sem alterar código de produção). Usa as classes REAIS do SDK.
 * Não prova: o comportamento da API real, o timeout real do SDK (10 min) nem as
 * retentativas internas do SDK (invisíveis para este mock).
 */
describe('OcrService: classificação de erros e medição da chamada', () => {
  const SIGNED_URL =
    'https://bucket.s3.amazonaws.com/bills/u1/foto.jpg?X-Amz-Signature=ASSINATURASECRETA';

  const originalEnv = {
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  };

  let create: jest.Mock;

  const buildService = (): any => {
    const service: any = new OcrService();
    service.openaiClient = { chat: { completions: { create } } };
    service.sleep = jest.fn().mockResolvedValue(undefined);
    return service;
  };

  const completion = (content: string, extra: object = {}) => ({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
    _request_id: 'req_abc123',
    ...extra,
  });

  const validContent = JSON.stringify({
    establishmentName: 'Bar do Sigilo',
    items: [
      { name: 'Picanha Secreta', quantity: 1, unitPrice: 10, totalPrice: 10 },
    ],
    totalAmount: 10,
  });

  const apiError = (status: number, body: object = {}) =>
    APIError.generate(
      status,
      body,
      'mensagem da OpenAI com ' + SIGNED_URL,
      new Headers(),
    );

  const capture = async (service: any, context: object = {}) => {
    const calls: OpenAiCallMetrics[] = [];
    let thrown: any;
    let result: any;
    try {
      result = await service.processImage(SIGNED_URL, {
        ...context,
        onOpenAiCall: (metrics: OpenAiCallMetrics) => calls.push(metrics),
      });
    } catch (error) {
      thrown = error;
    }
    return { calls, thrown, result };
  };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4.1-mini';
    create = jest.fn();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
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

  describe('exceção devolvida: mesma classe e status de antes, com a categoria anexada', () => {
    it('timeout do SDK: 500 como antes (o ramo "conexão" é inalcançável), mas classificado TIMEOUT', async () => {
      create.mockRejectedValue(new APIConnectionTimeoutError());

      const { thrown, calls } = await capture(buildService());

      // Característica atual: APIConnectionTimeoutError estende APIError, então cai
      // no ramo "outros erros da API" (500, status indefinido) e não no ramo de
      // conexão (503). A classificação usa o erro ORIGINAL e acerta mesmo assim.
      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      expect(thrown.getStatus()).toBe(500);
      expect(classifyOcrError(thrown).category).toBe('TIMEOUT');
      expect(create).toHaveBeenCalledTimes(3);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        openaiCalls: 3,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      });
    });

    it('429: 503 como antes, classificado TRANSIENT com o status', async () => {
      create.mockRejectedValue(
        apiError(429, { error: { code: 'rate_limit_exceeded' } }),
      );

      const { thrown } = await capture(buildService());

      expect(thrown).toBeInstanceOf(ServiceUnavailableException);
      expect(classifyOcrError(thrown)).toMatchObject({
        category: 'TRANSIENT',
        httpStatus: 429,
        errorCode: 'rate_limit_exceeded',
      });
      expect(create).toHaveBeenCalledTimes(3);
    });

    it('5xx: 500 como antes, classificado TRANSIENT', async () => {
      create.mockRejectedValue(apiError(502));

      const { thrown } = await capture(buildService());

      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      expect(classifyOcrError(thrown)).toMatchObject({
        category: 'TRANSIENT',
        httpStatus: 502,
      });
    });

    it('401: 500 como antes, classificado CREDENTIAL, sem repetir na OcrService', async () => {
      create.mockRejectedValue(apiError(401));

      const { thrown } = await capture(buildService());

      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      expect(classifyOcrError(thrown)).toMatchObject({
        category: 'CREDENTIAL',
        httpStatus: 401,
      });
      // Característica atual: a OcrService para no primeiro erro permanente
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('400: 400 como antes, classificado INVALID_REQUEST, sem repetir na OcrService', async () => {
      create.mockRejectedValue(apiError(400));

      const { thrown } = await capture(buildService());

      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(classifyOcrError(thrown)).toMatchObject({
        category: 'INVALID_REQUEST',
        httpStatus: 400,
      });
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('resposta vazia: 500 genérico como antes, classificado INVALID_RESULT (com tokens medidos)', async () => {
      create.mockResolvedValue(completion('   '));

      const { thrown, calls } = await capture(buildService());

      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      expect(classifyOcrError(thrown).category).toBe('INVALID_RESULT');
      // A chamada foi cobrada: os tokens chegam à fila uma única vez
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        promptTokens: 1200,
        completionTokens: 300,
      });
    });

    it('erro desconhecido: 500 genérico como antes, classificado UNKNOWN', async () => {
      create.mockRejectedValue(new Error('algo inesperado'));

      const { thrown } = await capture(buildService());

      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      expect(classifyOcrError(thrown).category).toBe('UNKNOWN');
    });

    it('a classificação anexada não carrega a mensagem do provedor nem a URL', async () => {
      create.mockRejectedValue(apiError(400));

      const { thrown } = await capture(buildService());

      const serialized = JSON.stringify(classifyOcrError(thrown));
      expect(serialized).not.toContain('ASSINATURASECRETA');
      expect(serialized).not.toContain('amazonaws');
      expect(serialized).not.toContain('mensagem da OpenAI');
    });
  });

  describe('medição da chamada entregue à fila', () => {
    it('no sucesso entrega modelo, duração, chamadas, tokens e id da requisição, uma vez', async () => {
      create.mockResolvedValue(completion(validContent));

      const { calls, result } = await capture(buildService(), {
        jobId: 'job-1',
      });

      expect(result.items).toHaveLength(1);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        openaiCalls: 1,
        promptTokens: 1200,
        completionTokens: 300,
        totalTokens: 1500,
        providerRequestId: 'req_abc123',
      });
      expect(calls[0].openaiMs).toBeGreaterThanOrEqual(0);
    });

    it('conta as chamadas da camada própria quando há retentativa', async () => {
      create
        .mockRejectedValueOnce(apiError(500))
        .mockResolvedValueOnce(completion(validContent));

      const { calls } = await capture(buildService());

      expect(calls).toHaveLength(1);
      expect(calls[0].openaiCalls).toBe(2);
    });

    it('id da requisição fora do padrão seguro vira null', async () => {
      create.mockResolvedValue(
        completion(validContent, {
          _request_id: 'id com espaços e https://x.test',
        }),
      );

      const { calls } = await capture(buildService());

      expect(calls[0].providerRequestId).toBeNull();
    });

    it('tokens ausentes na resposta viram null (e não 0)', async () => {
      create.mockResolvedValue(completion(validContent, { usage: undefined }));

      const { calls } = await capture(buildService());

      expect(calls[0]).toMatchObject({
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
      });
    });

    it('um callback que lança erro não derruba a leitura', async () => {
      create.mockResolvedValue(completion(validContent));

      const result = await buildService().processImage(SIGNED_URL, {
        onOpenAiCall: () => {
          throw new Error('callback quebrado');
        },
      });

      expect(result.items).toHaveLength(1);
    });
  });

  describe('retorno inválido: caracterização do comportamento atual', () => {
    it('total divergente da soma dos itens: os leitores de contingência ACEITAM o resultado', async () => {
      // Soma dos itens = 10, total informado = 99: a validação do DTO falha,
      // mas o resultado volta (conta iria a REVIEWING e o job a COMPLETED)
      create.mockResolvedValue(
        completion(
          JSON.stringify({
            items: [
              { name: 'Item A', quantity: 1, unitPrice: 4, totalPrice: 4 },
              { name: 'Item B', quantity: 1, unitPrice: 6, totalPrice: 6 },
            ],
            totalAmount: 99,
          }),
        ),
      );

      const { thrown, result } = await capture(buildService());

      expect(thrown).toBeUndefined();
      expect(result.items).toHaveLength(2);
      expect(result.totalAmount).toBe(99);
    });

    it('JSON ilegível sem linhas de item: volta sem itens (a fila trata como INVALID_RESULT)', async () => {
      create.mockResolvedValue(completion('isto nao e json'));

      const { thrown, result } = await capture(buildService());

      expect(thrown).toBeUndefined();
      expect(result.items).toHaveLength(0);
    });
  });
});
