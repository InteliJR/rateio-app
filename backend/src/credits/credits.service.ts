import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CreditPolicy,
  CreditReservationStatus,
  CreditTransactionType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreditBalance {
  /** Créditos que o usuário possui, incluindo os que estão reservados. */
  balance: number;
  /** Créditos presos em leituras em andamento. */
  held: number;
  /** Créditos utilizáveis agora. É este o número exibido no aplicativo. */
  available: number;
  policy: CreditPolicy;
  freeGrantTotal: number;
  /** Quando a cota gratuita renova. Nulo enquanto a cota for concedida uma única vez. */
  resetsAt: string | null;
}

export interface GrantCreditsInput {
  userId: string;
  credits: number;
  /** Chave de idempotência. Repetir a mesma referência não soma créditos de novo. */
  reference: string;
  type?: CreditTransactionType;
  purchaseToken?: string;
  reason?: string;
  actorId?: string;
}

export interface ReserveResult {
  /** Falso quando a conta é isenta: nada foi debitado. */
  reserved: boolean;
  policy: CreditPolicy;
}

/** Linha do histórico exibida ao usuário. Não expõe chave, token nem autor. */
export interface CreditHistoryEntry {
  id: string;
  type: CreditTransactionType;
  amount: number;
  reason: string | null;
  createdAt: Date;
}

export interface CreditHistoryPage {
  data: CreditHistoryEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface AdminAdjustInput {
  userId: string;
  /** Positivo concede, negativo retira. Nunca zero. */
  amount: number;
  reason: string;
  actorId: string;
  /** Enviada pelo cliente: repetir o mesmo pedido não ajusta duas vezes. */
  idempotencyKey: string;
}

export interface AdminAdjustResult {
  /** Falso quando a chave já tinha sido usada: nada mudou. */
  applied: boolean;
  available: number;
}

/** Erro de domínio: o usuário não tem créditos disponíveis. */
export class InsufficientCreditsError extends Error {
  constructor(public readonly available: number) {
    super('Créditos insuficientes para iniciar a leitura');
    this.name = 'InsufficientCreditsError';
  }
}

/** Erro de domínio: o ajuste deixaria o saldo disponível negativo. */
export class NegativeBalanceError extends Error {
  constructor(public readonly available: number) {
    super('O ajuste deixaria o saldo negativo');
    this.name = 'NegativeBalanceError';
  }
}

/** Erro de domínio: a chave de idempotência já foi usada em outro ajuste. */
export class IdempotencyKeyConflictError extends Error {
  constructor() {
    super('Chave de idempotência já usada em outro ajuste');
    this.name = 'IdempotencyKeyConflictError';
  }
}

const UNIQUE_VIOLATION = 'P2002';
const MAX_HISTORY_LIMIT = 50;

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  private readonly freeQuota = Number(process.env.CREDITS_FREE_QUOTA ?? 3);
  private readonly reservationTtlMs = Number(
    process.env.CREDITS_RESERVATION_TTL_MS ?? 15 * 60 * 1000,
  );

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Saldo do usuário. Concede a cota gratuita na primeira consulta, de forma
   * idempotente, para que uma conta criada antes do ledger também receba.
   */
  async getBalance(userId: string): Promise<CreditBalance> {
    await this.ensureFreeGrant(userId);

    const [user, sum, held] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { creditPolicy: true },
      }),
      this.prisma.creditTransaction.aggregate({
        where: { userId },
        _sum: { amount: true },
      }),
      this.prisma.creditReservation.count({
        where: { userId, status: CreditReservationStatus.HELD },
      }),
    ]);

    const available = sum._sum.amount ?? 0;

    return {
      balance: available + held,
      held,
      available,
      policy: user?.creditPolicy ?? CreditPolicy.METERED,
      freeGrantTotal: this.freeQuota,
      resetsAt: null,
    };
  }

  /** Concede a cota gratuita uma única vez por usuário. */
  async ensureFreeGrant(userId: string): Promise<void> {
    if (this.freeQuota <= 0) {
      return;
    }

    await this.grant({
      userId,
      credits: this.freeQuota,
      reference: `free-grant:${userId}`,
      type: CreditTransactionType.FREE_GRANT,
      reason: 'Cota gratuita inicial',
    });
  }

  /**
   * Soma créditos ao usuário. Usado pela compra na loja, pelo anúncio
   * recompensado e pela cota gratuita. Repetir a mesma `reference` não soma
   * de novo: é esta garantia que a verificação de compras espera.
   */
  async grant(input: GrantCreditsInput): Promise<void> {
    if (input.credits <= 0) {
      return;
    }

    try {
      await this.prisma.creditTransaction.create({
        data: {
          userId: input.userId,
          type: input.type ?? CreditTransactionType.PURCHASE,
          amount: input.credits,
          idempotencyKey: input.reference,
          purchaseToken: input.purchaseToken,
          reason: input.reason,
          actorId: input.actorId,
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        // Já concedido antes com a mesma referência. Nada a fazer.
        return;
      }
      throw error;
    }
  }

  /**
   * Reserva um crédito antes de enfileirar a leitura. A reserva já sai do saldo
   * disponível, então duas requisições simultâneas não conseguem gastar o mesmo
   * crédito: a linha do usuário é travada enquanto o saldo é conferido.
   */
  async reserve(userId: string, ocrJobId: string): Promise<ReserveResult> {
    await this.ensureFreeGrant(userId);

    return this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<{ creditPolicy: CreditPolicy }[]>`
        SELECT "creditPolicy" FROM "users" WHERE "id" = ${userId} FOR UPDATE
      `;

      const policy = user?.creditPolicy ?? CreditPolicy.METERED;

      if (policy === CreditPolicy.UNLIMITED) {
        return { reserved: false, policy };
      }

      const existing = await tx.creditReservation.findUnique({
        where: { ocrJobId },
      });

      if (existing) {
        // Retentativa do mesmo trabalho: reaproveita a reserva, não cobra de novo.
        return {
          reserved: existing.status === CreditReservationStatus.HELD,
          policy,
        };
      }

      const sum = await tx.creditTransaction.aggregate({
        where: { userId },
        _sum: { amount: true },
      });
      const available = sum._sum.amount ?? 0;

      if (available < 1) {
        throw new InsufficientCreditsError(available);
      }

      await tx.creditTransaction.create({
        data: {
          userId,
          type: CreditTransactionType.RESERVE,
          amount: -1,
          idempotencyKey: `reserve:${ocrJobId}`,
          ocrJobId,
          reason: 'Reserva para leitura de nota fiscal',
        },
      });

      await tx.creditReservation.create({
        data: {
          userId,
          ocrJobId,
          expiresAt: new Date(Date.now() + this.reservationTtlMs),
        },
      });

      return { reserved: true, policy };
    });
  }

  /**
   * Confirma o gasto: a leitura produziu um resultado utilizável. Não mexe no
   * saldo, porque a reserva já o debitou; apenas fecha a reserva.
   */
  async consume(ocrJobId: string): Promise<void> {
    await this.settle(
      ocrJobId,
      CreditReservationStatus.CONSUMED,
      CreditTransactionType.CONSUME,
      0,
      'Leitura concluída com resultado utilizável',
    );
  }

  /**
   * Devolve o crédito. Usado quando a falha é nossa ou do provedor: o usuário
   * não paga por uma leitura sem resultado.
   */
  async release(ocrJobId: string, reason?: string): Promise<void> {
    await this.settle(
      ocrJobId,
      CreditReservationStatus.RELEASED,
      CreditTransactionType.RELEASE,
      1,
      reason ?? 'Falha na leitura: crédito devolvido',
    );
  }

  /** Devolve reservas que ficaram penduradas, por exemplo após uma queda do processo. */
  async releaseExpired(): Promise<number> {
    const expired = await this.prisma.creditReservation.findMany({
      where: {
        status: CreditReservationStatus.HELD,
        expiresAt: { lt: new Date() },
      },
      select: { ocrJobId: true },
    });

    for (const reservation of expired) {
      await this.release(reservation.ocrJobId, 'Reserva expirada');
    }

    if (expired.length > 0) {
      this.logger.warn(
        `${expired.length} reserva(s) expirada(s) devolvida(s).`,
      );
    }

    return expired.length;
  }

  /**
   * Histórico do usuário. Reserva e devolução da mesma leitura se anulam e não
   * aparecem: para o usuário, uma leitura que falhou não custou nada.
   */
  async getHistory(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<CreditHistoryPage> {
    const validPage = Math.max(1, Math.floor(page) || 1);
    const validLimit = Math.max(
      1,
      Math.min(MAX_HISTORY_LIMIT, Math.floor(limit) || 20),
    );

    const released = await this.prisma.creditTransaction.findMany({
      where: { userId, type: CreditTransactionType.RELEASE },
      select: { ocrJobId: true },
    });
    const releasedJobIds = released
      .map((row) => row.ocrJobId)
      .filter((id): id is string => id !== null);

    const where: Prisma.CreditTransactionWhereInput = {
      userId,
      type: { not: CreditTransactionType.RELEASE },
      NOT: {
        type: CreditTransactionType.RESERVE,
        ocrJobId: { in: releasedJobIds },
      },
    };

    const [total, data] = await Promise.all([
      this.prisma.creditTransaction.count({ where }),
      this.prisma.creditTransaction.findMany({
        where,
        select: {
          id: true,
          type: true,
          amount: true,
          reason: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (validPage - 1) * validLimit,
        take: validLimit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages: Math.ceil(total / validLimit),
      },
    };
  }

  /**
   * Ajuste manual do suporte. Fica registrado com autor e motivo, não deixa o
   * saldo disponível negativo e é idempotente pela chave enviada pelo cliente.
   */
  async adminAdjust(input: AdminAdjustInput): Promise<AdminAdjustResult> {
    const idempotencyKey = `admin:${input.idempotencyKey}`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Mesma trava da reserva: ajuste e leitura simultâneos não furam o saldo.
        const [user] = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE
        `;
        if (!user) {
          throw new NotFoundException('Usuário não encontrado');
        }

        const existing = await tx.creditTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          return this.repeatedAdjust(tx, existing, input);
        }

        const sum = await tx.creditTransaction.aggregate({
          where: { userId: input.userId },
          _sum: { amount: true },
        });
        const available = sum._sum.amount ?? 0;

        if (available + input.amount < 0) {
          throw new NegativeBalanceError(available);
        }

        await tx.creditTransaction.create({
          data: {
            userId: input.userId,
            type: CreditTransactionType.ADMIN_ADJUST,
            amount: input.amount,
            idempotencyKey,
            reason: input.reason,
            actorId: input.actorId,
          },
        });

        this.logger.log(
          `Ajuste administrativo de ${input.amount} crédito(s) no usuário ${input.userId} por ${input.actorId}.`,
        );

        return { applied: true, available: available + input.amount };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        // Pedido repetido ao mesmo tempo: o outro já gravou.
        return this.prisma.$transaction(async (tx) => {
          const existing = await tx.creditTransaction.findUniqueOrThrow({
            where: { idempotencyKey },
          });
          return this.repeatedAdjust(tx, existing, input);
        });
      }
      throw error;
    }
  }

  private async repeatedAdjust(
    tx: Prisma.TransactionClient,
    existing: { userId: string; type: CreditTransactionType; amount: number },
    input: AdminAdjustInput,
  ): Promise<AdminAdjustResult> {
    if (
      existing.type !== CreditTransactionType.ADMIN_ADJUST ||
      existing.userId !== input.userId ||
      existing.amount !== input.amount
    ) {
      throw new IdempotencyKeyConflictError();
    }

    const sum = await tx.creditTransaction.aggregate({
      where: { userId: input.userId },
      _sum: { amount: true },
    });
    return { applied: false, available: sum._sum.amount ?? 0 };
  }

  private async settle(
    ocrJobId: string,
    status: CreditReservationStatus,
    type: CreditTransactionType,
    amount: number,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.creditReservation.findUnique({
        where: { ocrJobId },
      });

      if (!reservation || reservation.status !== CreditReservationStatus.HELD) {
        // Conta isenta, ou reserva já fechada. Fechar duas vezes não muda o saldo.
        return;
      }

      await tx.creditReservation.update({
        where: { ocrJobId },
        data: { status },
      });

      if (amount !== 0) {
        await tx.creditTransaction.create({
          data: {
            userId: reservation.userId,
            type,
            amount,
            idempotencyKey: `${type.toLowerCase()}:${ocrJobId}`,
            ocrJobId,
            reason,
          },
        });
      }
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    );
  }
}
