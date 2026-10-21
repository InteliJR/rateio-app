import { HttpException } from '@nestjs/common';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from 'openai';

/**
 * Categorias de falha do OCR, para métricas. Só CLASSIFICA: não altera a
 * retentativa (a fila continua repetindo qualquer erro até OCR_QUEUE_MAX_ATTEMPTS).
 *
 * Como ler as linhas de ocr_run_metrics:
 * - "esgotamento de tentativas" = outcome FAILED_FINAL com errorCategory diferente
 *   de IMAGE_MISSING (a falha final registra a CAUSA, não "esgotado");
 * - "motivo de retentativa" = errorCategory das linhas RETRY_SCHEDULED;
 * - EXHAUSTED fica reservada ao lock vencido com tentativas esgotadas (branch futura).
 *
 * Nunca guarda a mensagem do erro: só categoria, status HTTP e códigos curtos em
 * padrão seguro (a mensagem da OpenAI pode conter a URL assinada da imagem).
 */
export const OCR_ERROR_CATEGORIES = [
  'TRANSIENT',
  'TIMEOUT',
  'CREDENTIAL',
  'INVALID_REQUEST',
  'IMAGE_MISSING',
  'INVALID_RESULT',
  'EXHAUSTED',
  'INTERNAL',
  'UNKNOWN',
] as const;

export type OcrErrorCategoryName = (typeof OCR_ERROR_CATEGORIES)[number];

export interface OcrFailure {
  category: OcrErrorCategoryName;
  httpStatus: number | null;
  errorCode: string | null;
  providerRequestId: string | null;
}

/** Resposta da OpenAI sem conteúdo utilizável (corpo vazio). */
export class OcrEmptyResponseError extends Error {
  constructor() {
    super('Nenhum dado extraído da imagem');
    this.name = 'OcrEmptyResponseError';
  }
}

/** Resultado sem itens ou com texto curto demais (validateOcrResult). */
export class OcrInvalidResultError extends Error {
  constructor() {
    super('OCR returned invalid structured data.');
    this.name = 'OcrInvalidResultError';
  }
}

const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Devolve o valor só se for um código curto em padrão seguro; senão, null. */
export function toSafeCode(value: unknown): string | null {
  return typeof value === 'string' && SAFE_CODE_PATTERN.test(value)
    ? value
    : null;
}

function toHttpStatus(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null;
}

/** Monta uma classificação normalizada (status e códigos só em padrão seguro). */
export function buildOcrFailure(
  category: OcrErrorCategoryName,
  details: {
    httpStatus?: unknown;
    errorCode?: unknown;
    providerRequestId?: unknown;
  } = {},
): OcrFailure {
  return {
    category,
    httpStatus: toHttpStatus(details.httpStatus),
    errorCode: toSafeCode(details.errorCode),
    providerRequestId: toSafeCode(details.providerRequestId),
  };
}

function categoryForStatus(status: number): OcrErrorCategoryName {
  if (status === 408) return 'TIMEOUT';
  if (status === 429 || status >= 500) return 'TRANSIENT';
  if (status === 401 || status === 403) return 'CREDENTIAL';
  if (status >= 400) return 'INVALID_REQUEST';
  return 'UNKNOWN';
}

const ATTACHED_PROPERTY = 'ocrFailure';

/**
 * Anexa a classificação à exceção que a OcrService já devolvia, sem mudar a
 * classe, o status nem a mensagem. A propriedade não é enumerável, então não
 * aparece em JSON nem em logs de objeto.
 */
export function attachOcrFailure<T extends object>(
  exception: T,
  value: OcrFailure,
): T {
  Object.defineProperty(exception, ATTACHED_PROPERTY, {
    value,
    enumerable: false,
    configurable: true,
  });
  return exception;
}

function readAttachedFailure(error: object): OcrFailure | null {
  const attached = (error as Record<string, unknown>)[ATTACHED_PROPERTY];

  if (
    attached &&
    typeof attached === 'object' &&
    OCR_ERROR_CATEGORIES.includes(
      (attached as { category?: OcrErrorCategoryName }).category as never,
    )
  ) {
    const typed = attached as Partial<OcrFailure>;
    return buildOcrFailure(typed.category as OcrErrorCategoryName, typed);
  }

  return null;
}

/**
 * Classifica qualquer valor lançado. Nunca lança: entradas estranhas (null,
 * string, objeto sem campos, objeto que falha ao ser lido) viram UNKNOWN.
 */
export function classifyOcrError(error: unknown): OcrFailure {
  try {
    if (error === null || typeof error !== 'object') {
      return buildOcrFailure('UNKNOWN');
    }

    const attached = readAttachedFailure(error);
    if (attached) {
      return attached;
    }

    if (error instanceof OcrEmptyResponseError) {
      return buildOcrFailure('INVALID_RESULT');
    }

    if (error instanceof OcrInvalidResultError) {
      return buildOcrFailure('INVALID_RESULT');
    }

    if (error instanceof APIConnectionTimeoutError) {
      return buildOcrFailure('TIMEOUT', { providerRequestId: error.requestID });
    }

    if (error instanceof APIConnectionError) {
      return buildOcrFailure('TRANSIENT', {
        providerRequestId: error.requestID,
      });
    }

    if (error instanceof APIError) {
      const status = toHttpStatus(error.status);
      return buildOcrFailure(
        status === null ? 'UNKNOWN' : categoryForStatus(status),
        {
          httpStatus: status,
          errorCode: error.code,
          providerRequestId: error.requestID,
        },
      );
    }

    // Exceções do Nest sem classificação anexada: o status HTTP delas não diz
    // a causa (503 serve para 429 e para queda de conexão).
    if (error instanceof HttpException) {
      return buildOcrFailure('UNKNOWN');
    }

    const named = error as { name?: unknown; code?: unknown };
    if (
      (typeof named.name === 'string' &&
        named.name.startsWith('PrismaClient')) ||
      (typeof named.code === 'string' && /^P\d{4}$/.test(named.code))
    ) {
      return buildOcrFailure('INTERNAL');
    }

    return buildOcrFailure('UNKNOWN');
  } catch {
    return buildOcrFailure('UNKNOWN');
  }
}
