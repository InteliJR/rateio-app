import { Injectable, Logger } from '@nestjs/common';
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

/** Erro de domínio: o usuário não tem créditos disponíveis. */
export class InsufficientCreditsError extends Error {
  constructor(public readonly available: number) {
    super('Créditos insuficientes para iniciar a leitura');
    this.name = 'InsufficientCreditsError';
  }
}

const UNIQUE_VIOLATION = 'P2002';

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

  /** Ajuste manual do suporte. Fica registrado com autor e motivo. */
  async adminAdjust(
    userId: string,
    amount: number,
    reason: string,
    actorId: string,
  ): Promise<void> {
    await this.prisma.creditTransaction.create({
      data: {
        userId,
        type: CreditTransactionType.ADMIN_ADJUST,
        amount,
        idempotencyKey: `admin:${userId}:${Date.now()}`,
        reason,
        actorId,
      },
    });
  }

  private async settle(
    ocrJobId: string,
    status: CreditReservationStatus,
    type: CreditTransactionType,
    amount: number,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Fecha a reserva em uma única operação condicional: o próprio UPDATE
      // confere que ela ainda está em HELD. Ler antes e atualizar depois deixa
      // uma brecha em que um consume e um release simultâneos passam os dois
      // pela checagem, a reserva fica consumida e o crédito volta assim mesmo,
      // ou seja, a leitura sai de graça.
      const fechada = await tx.creditReservation.updateMany({
        where: { ocrJobId, status: CreditReservationStatus.HELD },
        data: { status },
      });

      if (fechada.count === 0) {
        // Conta isenta, ou outra chamada já fechou esta reserva.
        return;
      }

      const reservation = await tx.creditReservation.findUniqueOrThrow({
        where: { ocrJobId },
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
