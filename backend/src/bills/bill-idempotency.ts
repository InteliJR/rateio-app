import { createHash } from 'crypto';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { IdempotencyKey, Prisma } from '@prisma/client';

export const IDEMPOTENCY_OPERATIONS = {
  CREATE_WITH_IMAGE: 'CREATE_WITH_IMAGE',
  ATTACH_IMAGE: 'ATTACH_IMAGE',
  RETRY_OCR: 'RETRY_OCR',
} as const;

export type IdempotencyOperation =
  (typeof IDEMPOTENCY_OPERATIONS)[keyof typeof IDEMPOTENCY_OPERATIONS];

type HashPayload = Record<string, string | number | null | undefined>;

/**
 * Hash do que identifica a requisição. Em envios multipart cobre apenas
 * metadados (nome do estabelecimento, tipo e tamanho do arquivo), não os bytes.
 */
export function hashIdempotentRequest(
  operation: IdempotencyOperation,
  payload: HashPayload,
): string {
  const normalized = Object.keys(payload)
    .sort()
    .map((field) => [field, payload[field] ?? null]);

  return createHash('sha256')
    .update(JSON.stringify([operation, normalized]))
    .digest('hex');
}

/**
 * Valida o cabeçalho Idempotency-Key. Ausente = sem idempotência (comportamento
 * anterior); presente e fora do formato UUID = 400.
 */
export function parseIdempotencyKey(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (typeof value !== 'string' || !isUUID(value)) {
    throw new BadRequestException('Idempotency-Key deve ser um UUID.');
  }

  return value.toLowerCase();
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Procura uma chave já usada pelo usuário. Devolve o registro quando é um replay
 * legítimo, null quando a chave é nova e lança 422 se a chave já foi usada em
 * outra operação ou com outro payload.
 */
export async function findIdempotentReplay(
  client: Pick<Prisma.TransactionClient, 'idempotencyKey'>,
  userId: string,
  key: string,
  operation: IdempotencyOperation,
  requestHash: string,
): Promise<IdempotencyKey | null> {
  const record = await client.idempotencyKey.findUnique({
    where: { userId_key: { userId, key } },
  });

  if (!record) {
    return null;
  }

  if (record.operation !== operation || record.requestHash !== requestHash) {
    throw new UnprocessableEntityException(
      'Chave de idempotência já utilizada com outra requisição.',
    );
  }

  return record;
}
