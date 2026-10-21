import 'reflect-metadata';
import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from 'openai';
import {
  OcrEmptyResponseError,
  OcrInvalidResultError,
  attachOcrFailure,
  buildOcrFailure,
  classifyOcrError,
  toSafeCode,
} from './ocr-error-category';

/**
 * Classificação de erros do OCR (função pura). Usa as classes REAIS do SDK da
 * OpenAI para construir os erros. Não prova: o formato dos erros que a API real
 * devolve hoje (o SDK é que monta essas classes a partir da resposta HTTP).
 */
describe('classifyOcrError', () => {
  const apiError = (status: number, body: object = {}) =>
    APIError.generate(
      status,
      body,
      'mensagem com https://x.test/?sig=SEGREDO',
      new Headers(),
    );

  describe('erros do SDK da OpenAI', () => {
    it.each([
      [429, 'TRANSIENT'],
      [500, 'TRANSIENT'],
      [502, 'TRANSIENT'],
      [503, 'TRANSIENT'],
      [408, 'TIMEOUT'],
      [401, 'CREDENTIAL'],
      [403, 'CREDENTIAL'],
      [400, 'INVALID_REQUEST'],
      [404, 'INVALID_REQUEST'],
      [409, 'INVALID_REQUEST'],
      [422, 'INVALID_REQUEST'],
    ])('status %i vira %s e guarda o status', (status, category) => {
      expect(classifyOcrError(apiError(status))).toMatchObject({
        category,
        httpStatus: status,
      });
    });

    it('timeout de conexão do SDK vira TIMEOUT', () => {
      expect(classifyOcrError(new APIConnectionTimeoutError())).toMatchObject({
        category: 'TIMEOUT',
        httpStatus: null,
      });
    });

    it('queda de conexão vira TRANSIENT (e não TIMEOUT)', () => {
      expect(
        classifyOcrError(new APIConnectionError({ message: 'socket hang up' })),
      ).toMatchObject({ category: 'TRANSIENT' });
    });

    it('guarda só código curto em padrão seguro e descarta o resto', () => {
      expect(
        classifyOcrError(
          apiError(429, { error: { code: 'rate_limit_exceeded' } }),
        ),
      ).toMatchObject({ errorCode: 'rate_limit_exceeded' });

      const dirty = classifyOcrError(
        apiError(400, {
          error: { code: 'texto livre com espaços e https://x.test' },
        }),
      );
      expect(dirty.errorCode).toBeNull();
    });

    it('nunca carrega a mensagem do erro', () => {
      const result = classifyOcrError(apiError(400));
      expect(JSON.stringify(result)).not.toContain('SEGREDO');
      expect(Object.keys(result).sort()).toEqual([
        'category',
        'errorCode',
        'httpStatus',
        'providerRequestId',
      ]);
    });
  });

  describe('erros do próprio OCR', () => {
    it('resposta vazia e resultado sem itens viram INVALID_RESULT', () => {
      expect(classifyOcrError(new OcrEmptyResponseError()).category).toBe(
        'INVALID_RESULT',
      );
      expect(classifyOcrError(new OcrInvalidResultError()).category).toBe(
        'INVALID_RESULT',
      );
    });

    it('mantêm a mensagem original (nada muda para quem lê o erro)', () => {
      expect(new OcrEmptyResponseError().message).toBe(
        'Nenhum dado extraído da imagem',
      );
      expect(new OcrInvalidResultError().message).toBe(
        'OCR returned invalid structured data.',
      );
    });

    it('erros do Prisma viram INTERNAL', () => {
      expect(
        classifyOcrError(
          Object.assign(new Error('x'), {
            name: 'PrismaClientKnownRequestError',
          }),
        ).category,
      ).toBe('INTERNAL');
      expect(
        classifyOcrError(Object.assign(new Error('x'), { code: 'P2034' }))
          .category,
      ).toBe('INTERNAL');
    });
  });

  describe('classificação anexada à exceção da OcrService', () => {
    it('vence sobre o tipo da exceção (503 serve para 429 e para timeout)', () => {
      const timeout = attachOcrFailure(
        new ServiceUnavailableException('Não foi possível conectar'),
        buildOcrFailure('TIMEOUT'),
      );
      const rateLimit = attachOcrFailure(
        new ServiceUnavailableException('Limite excedido'),
        buildOcrFailure('TRANSIENT', { httpStatus: 429 }),
      );

      expect(classifyOcrError(timeout).category).toBe('TIMEOUT');
      expect(classifyOcrError(rateLimit)).toMatchObject({
        category: 'TRANSIENT',
        httpStatus: 429,
      });
    });

    it('não muda a exceção: mesma classe, status, mensagem e JSON', () => {
      const original = new InternalServerErrorException('mensagem original');
      const before = JSON.stringify(original.getResponse());

      const tagged = attachOcrFailure(original, buildOcrFailure('CREDENTIAL'));

      expect(tagged).toBe(original);
      expect(tagged.getStatus()).toBe(500);
      expect(tagged.message).toBe('mensagem original');
      expect(JSON.stringify(tagged.getResponse())).toBe(before);
      expect(Object.keys(tagged)).not.toContain('ocrFailure');
    });

    it('exceção do Nest sem classificação anexada vira UNKNOWN', () => {
      expect(classifyOcrError(new BadRequestException('x')).category).toBe(
        'UNKNOWN',
      );
    });
  });

  describe('entradas estranhas nunca lançam erro', () => {
    const throwingProxy = new Proxy(
      {},
      {
        get() {
          throw new Error('boom ao ler propriedade');
        },
        has() {
          throw new Error('boom');
        },
        getPrototypeOf() {
          throw new Error('boom');
        },
      },
    );

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['string', 'texto solto'],
      ['número', 42],
      ['booleano', true],
      ['símbolo', Symbol('x')],
      ['função', () => 1],
      ['objeto vazio', {}],
      ['array', []],
      ['objeto sem protótipo', Object.create(null)],
      ['status inválido', { status: 'abc', code: 123 }],
      ['classificação anexada inválida', { ocrFailure: { category: 'XYZ' } }],
      ['classificação anexada nula', { ocrFailure: null }],
      ['proxy que lança ao ler', throwingProxy],
    ])('%s -> UNKNOWN, sem lançar', (_name, value) => {
      let result: ReturnType<typeof classifyOcrError> | undefined;

      expect(() => {
        result = classifyOcrError(value);
      }).not.toThrow();
      expect(result).toMatchObject({
        category: 'UNKNOWN',
        httpStatus: null,
        errorCode: null,
      });
    });
  });

  describe('toSafeCode', () => {
    it('aceita só códigos curtos em padrão seguro', () => {
      expect(toSafeCode('req_abc123')).toBe('req_abc123');
      expect(toSafeCode('a'.repeat(64))).toBe('a'.repeat(64));
      expect(toSafeCode('a'.repeat(65))).toBeNull();
      expect(toSafeCode('com espaço')).toBeNull();
      expect(toSafeCode('https://x.test/?sig=1')).toBeNull();
      expect(toSafeCode('')).toBeNull();
      expect(toSafeCode(null)).toBeNull();
      expect(toSafeCode(10)).toBeNull();
    });
  });
});
