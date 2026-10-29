import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BillStatus,
  CreditPolicy,
  OcrJob,
  OcrJobStatus,
  OcrRunOutcome,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { OcrResultDto } from './dto/ocr-result.dto';
import {
  CreditsService,
  InsufficientCreditsError,
} from '../credits/credits.service';
import { OcrService } from './ocr.service';
import { StorageService } from '../storage/storage.service';
import {
  OcrFailure,
  OcrInvalidResultError,
  buildOcrFailure,
  classifyOcrError,
} from './ocr-error-category';
import { OpenAiCallMetrics, recordOcrRunMetric } from './ocr-run-metrics';
import {
  CREDIT_RELEASE_REASONS,
  creditRunKey,
  failedReleaseReason,
  isCreditsEnforcementEnabled,
  isUsableOcrResult,
} from './ocr-credits';

// Identifica uma execução do job: `token` é o valor de `attempts` logo após o claim
// e `imageKey` é a imagem que está sendo lida.
type OcrExecution = { token: number; imageKey: string | null };

type FailOutcome = 'retry_scheduled' | 'failed_final' | 'ignored';

// O que fazer com o crédito reservado quando a execução termina.
type CreditSettlement =
  | { action: 'consume' }
  | { action: 'release'; reason: string };

type PersistOutcome =
  | 'saved'
  | 'discarded_stale_execution'
  | 'discarded_bill_changed'
  | 'requeued_new_image';

@Injectable()
export class OcrQueueService {
  private readonly logger = new Logger(OcrQueueService.name);
  private readonly maxConcurrency = Number(
    process.env.OCR_QUEUE_CONCURRENCY ?? 2,
  );
  private readonly maxAttempts = Number(
    process.env.OCR_QUEUE_MAX_ATTEMPTS ?? 3,
  );
  private readonly retryDelayMs = Number(
    process.env.OCR_QUEUE_RETRY_DELAY_MS ?? 30000,
  );
  private readonly lockTimeoutMs = Number(
    process.env.OCR_QUEUE_LOCK_TIMEOUT_MS ?? 120000,
  );
  private readonly maxJobsPerRun = Number(
    process.env.OCR_QUEUE_MAX_JOBS_PER_RUN ??
      (process.env.VERCEL ? 1 : this.maxConcurrency),
  );
  private activeWorkers = 0;

  /**
   * Enquanto estiver desligado, o ledger não é tocado pela fila e nada muda no
   * comportamento. A bandeira é lida uma vez, ao criar o serviço.
   */
  private readonly creditsEnforced = isCreditsEnforcementEnabled();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly metrics: MetricsService,
    private readonly storage: StorageService,
    private readonly credits: CreditsService,
  ) {}

  /**
   * Pré-checagem de saldo ANTES do upload ao S3 (só com a cobrança ligada).
   * Apenas leitura: não reserva e NÃO substitui a reserva do `enqueue`, que é
   * quem decide. Se a consulta falhar, segue o fluxo (a reserva decide).
   */
  async assertCreditsAvailable(userId: string): Promise<void> {
    if (!this.creditsEnforced) {
      return;
    }

    try {
      const balance = await this.credits.getBalance(userId);
      if (balance.policy === CreditPolicy.METERED && balance.available < 1) {
        throw new InsufficientCreditsError(balance.available);
      }
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw error;
      }
      this.logger.warn(
        `CREDIT_PRECHECK_FAILED ${JSON.stringify({ errorName: this.errorName(error) })}`,
      );
    }
  }

  /**
   * Enfileira a leitura de uma conta sem reiniciar um job ativo:
   * - sem job: cria;
   * - FAILED: recria;
   * - COMPLETED: recria só se a imagem mudou (ou em `reprocess`, pedido explícito);
   * - PENDING: mantém e apenas aponta para a imagem mais recente;
   * - RUNNING: não muda; o resultado é conferido quando o job terminar.
   * `enqueued` diz se há trabalho novo (criado ou recriado) e não apenas reaproveitado.
   *
   * Com a cobrança ligada, o trabalho novo ou recriado reserva um crédito AQUI,
   * na transação do chamador (`options.tx`): sem saldo, o erro desfaz a conta, o
   * trabalho e a chave de idempotência. Só `enqueued=true` reserva, então
   * retentativas e jobs reaproveitados nunca reservam de novo.
   */
  async enqueue(
    billId: string,
    userId: string,
    options: {
      imageKey?: string | null;
      reprocess?: boolean;
      tx?: Prisma.TransactionClient;
    } = {},
  ): Promise<{ job: OcrJob; enqueued: boolean }> {
    const client: Pick<Prisma.TransactionClient, 'ocrJob' | 'bill'> =
      options.tx ?? this.prisma;
    const imageKey =
      options.imageKey !== undefined
        ? options.imageKey
        : ((
            await client.bill.findUnique({
              where: { id: billId },
              select: { imageKey: true },
            })
          )?.imageKey ?? null);

    // createMany + skipDuplicates (ON CONFLICT DO NOTHING) não derruba a transação
    // quando o job já existe, ao contrário de um create que lança erro de unicidade.
    const created = await client.ocrJob.createMany({
      data: [{ billId, userId, status: OcrJobStatus.PENDING, imageKey }],
      skipDuplicates: true,
    });

    if (created.count === 1) {
      return this.enqueuedResult(client, billId, userId, options.tx);
    }

    const requeueConditions: Prisma.OcrJobWhereInput[] = [
      { status: OcrJobStatus.FAILED },
    ];
    if (options.reprocess) {
      requeueConditions.push({ status: OcrJobStatus.COMPLETED });
    } else if (imageKey !== null) {
      requeueConditions.push({
        status: OcrJobStatus.COMPLETED,
        OR: [{ imageKey: null }, { imageKey: { not: imageKey } }],
      });
    }

    const requeued = await client.ocrJob.updateMany({
      where: { billId, OR: requeueConditions },
      data: {
        userId,
        status: OcrJobStatus.PENDING,
        attempts: 0,
        lockedAt: null,
        startedAt: null,
        finishedAt: null,
        lastError: null,
        availableAt: new Date(),
        imageKey,
        // Nova leitura = nova execução de cobrança (a anterior já foi consumida
        // ou liberada). Só aqui: requeueIfImageChanged mantém a mesma reserva.
        creditRun: { increment: 1 },
      },
    });

    if (requeued.count === 1) {
      return this.enqueuedResult(client, billId, userId, options.tx);
    }

    if (imageKey !== null) {
      await client.ocrJob.updateMany({
        where: {
          billId,
          status: OcrJobStatus.PENDING,
          OR: [{ imageKey: null }, { imageKey: { not: imageKey } }],
        },
        data: { imageKey },
      });
    }

    return {
      job: await client.ocrJob.findUniqueOrThrow({ where: { billId } }),
      enqueued: false,
    };
  }

  private async enqueuedResult(
    client: Pick<Prisma.TransactionClient, 'ocrJob' | 'bill'>,
    billId: string,
    userId: string,
    tx: Prisma.TransactionClient | undefined,
  ): Promise<{ job: OcrJob; enqueued: true }> {
    const job = await client.ocrJob.findUniqueOrThrow({ where: { billId } });

    if (this.creditsEnforced) {
      await this.credits.reserve(userId, creditRunKey(job), tx);
    }

    this.metrics.recordOcrQueued();
    return { job, enqueued: true };
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollQueue() {
    if (process.env.VERCEL) {
      return;
    }

    await this.processPendingJobs();
  }

  async processPendingJobs(maxJobs: number = this.maxJobsPerRun) {
    await this.releaseStaleLocks();

    const availableSlots = Math.min(
      Math.max(this.maxConcurrency - this.activeWorkers, 0),
      Math.max(1, maxJobs),
    );
    if (availableSlots === 0) {
      return { processed: 0, activeWorkers: this.activeWorkers };
    }

    let processed = 0;

    for (let index = 0; index < availableSlots; index += 1) {
      const claimed = await this.claimNextJob();
      if (!claimed) {
        break;
      }

      processed += 1;
      this.activeWorkers += 1;

      try {
        await this.runJob(claimed);
      } finally {
        this.activeWorkers -= 1;
      }
    }

    return { processed, activeWorkers: this.activeWorkers };
  }

  private async releaseStaleLocks() {
    const staleBefore = new Date(Date.now() - this.lockTimeoutMs);

    const released = await this.prisma.ocrJob.updateMany({
      where: {
        status: OcrJobStatus.RUNNING,
        lockedAt: { lt: staleBefore },
      },
      data: {
        status: OcrJobStatus.PENDING,
        lockedAt: null,
        availableAt: new Date(),
        lastError: 'OCR job lock expired; returned to queue.',
      },
    });

    if (released.count > 0) {
      this.logger.warn(`Released ${released.count} stale OCR job lock(s).`);
    }
  }

  private async claimNextJob() {
    const job = await this.prisma.ocrJob.findFirst({
      where: {
        status: OcrJobStatus.PENDING,
        availableAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        bill: {
          select: {
            id: true,
            imageUrl: true,
            imageKey: true,
          },
        },
      },
    });

    if (!job) {
      return null;
    }

    let claimed: OcrJob;
    try {
      // Reivindicação atômica: só um processador vence; o outro não encontra o job PENDING.
      claimed = await this.prisma.ocrJob.update({
        where: { id: job.id, status: OcrJobStatus.PENDING },
        data: {
          status: OcrJobStatus.RUNNING,
          attempts: { increment: 1 },
          lockedAt: new Date(),
          startedAt: new Date(),
          lastError: null,
          // A imagem lida é a que a conta aponta agora
          imageKey: job.bill.imageKey ?? job.imageKey,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        return null;
      }
      throw error;
    }

    // `attempts` segue com o valor anterior ao claim (semântica de retentativa e das
    // métricas); `claimToken` é o valor novo e identifica esta execução.
    return {
      ...job,
      attempts: claimed.attempts - 1,
      claimToken: claimed.attempts,
      imageKey: claimed.imageKey,
      startedAt: claimed.startedAt,
    };
  }

  private async runJob(job: {
    id: string;
    billId: string;
    attempts: number;
    availableAt: Date;
    imageKey?: string | null;
    creditRun?: number;
    claimToken?: number;
    startedAt?: Date | null;
    bill: { id: string; imageUrl: string | null; imageKey: string | null };
  }) {
    const jobStartedAt = Date.now();
    const queueWaitMs = jobStartedAt - job.availableAt.getTime();
    const execution: OcrExecution = {
      token: job.claimToken ?? job.attempts + 1,
      imageKey: job.imageKey !== undefined ? job.imageKey : job.bill.imageKey,
    };
    // Medição da chamada ao provedor, entregue pela OcrService (sucesso ou falha)
    const run: { call: OpenAiCallMetrics | null } = { call: null };
    // Decide o destino do crédito depois que o desfecho já está gravado. Só é
    // chamado com a cobrança ligada.
    let settlement: () => CreditSettlement | null = () => null;

    // Fecha a execução: o MESMO totalMs alimenta o log OCR_METRIC e a linha
    // persistida (melhor esforço: gravar a métrica nunca falha o job).
    const finish = async (result: {
      outcome: OcrRunOutcome;
      status: 'completed' | 'failed' | 'discarded';
      failure?: OcrFailure | null;
      items?: number | null;
    }) => {
      const totalMs = Date.now() - jobStartedAt;

      this.logJobMetric(
        job,
        queueWaitMs,
        totalMs,
        result.items ?? 0,
        result.status,
        result.failure?.category ?? null,
      );

      await recordOcrRunMetric(this.prisma, this.logger, {
        ocrJobId: job.id,
        billId: job.billId,
        attempt: job.attempts + 1,
        startedAt: job.startedAt ?? new Date(jobStartedAt),
        outcome: result.outcome,
        failure: result.failure,
        queueWaitMs,
        totalMs,
        items: result.items,
        call: run.call,
      });
    };

    const imageUrl = await this.getProcessableImageUrl(job.bill);

    if (!imageUrl) {
      const failure = buildOcrFailure('IMAGE_MISSING');
      const outcome = await this.failJob(
        job.id,
        job.billId,
        'Bill has no image URL for OCR.',
        false,
        0,
        execution,
      );
      await finish({
        outcome: this.toRunOutcome(outcome),
        status: 'failed',
        failure,
      });
      await this.settleCredit(job, () =>
        outcome === 'failed_final'
          ? { action: 'release', reason: failedReleaseReason(failure.category) }
          : null,
      );
      return;
    }

    const startedAt = Date.now();
    this.metrics.recordOcrStarted();

    let result: Parameters<typeof finish>[0];

    try {
      const ocrResult = await this.ocrService.processImage(imageUrl, {
        jobId: job.id,
        onOpenAiCall: (metrics) => {
          run.call = metrics;
        },
      });
      const outcome = await this.persistOcrResult(
        job.id,
        job.billId,
        execution,
        ocrResult,
      );

      if (outcome !== 'saved') {
        this.logger.warn(
          `OCR result for bill ${job.billId} discarded (${outcome}).`,
        );
        result = { outcome: OcrRunOutcome.DISCARDED, status: 'discarded' };
        if (outcome === 'discarded_bill_changed') {
          // O resultado não chegou ao usuário: não há leitura para cobrar.
          settlement = () => ({
            action: 'release',
            reason: CREDIT_RELEASE_REASONS.discardedBillChanged,
          });
        }
        // discarded_stale_execution: quem assumiu o job liquida o crédito.
        // requeued_new_image: a mesma reserva vale para a imagem nova.
      } else {
        const durationMs = Date.now() - startedAt;
        this.metrics.recordOcrCompleted(durationMs);

        this.logger.log(
          `OCR completed for bill ${job.billId} in ${durationMs}ms.`,
        );
        result = {
          outcome: OcrRunOutcome.COMPLETED,
          status: 'completed',
          items: ocrResult.items.length,
        };
        // Consome só DEPOIS de o resultado estar gravado (job COMPLETED).
        // Leitura não utilizável: grava como sempre, mas libera o crédito.
        settlement = () =>
          isUsableOcrResult(ocrResult)
            ? { action: 'consume' }
            : {
                action: 'release',
                reason: CREDIT_RELEASE_REASONS.unusableResult,
              };
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown OCR processing error';
      const shouldRetry = job.attempts + 1 < this.maxAttempts;
      const failure = classifyOcrError(error);

      const outcome = await this.failJob(
        job.id,
        job.billId,
        errorMessage,
        shouldRetry,
        durationMs,
        execution,
      );
      result = {
        outcome: this.toRunOutcome(outcome),
        status: 'failed',
        failure,
      };
      // Falha final (qualquer categoria): o usuário não paga por leitura sem
      // resultado. Retentativa agendada ou execução ignorada não mexem no crédito.
      settlement = () =>
        outcome === 'failed_final'
          ? { action: 'release', reason: failedReleaseReason(failure.category) }
          : null;
    }

    await finish(result);
    await this.settleCredit(job, settlement);
  }

  /**
   * Consome ou libera o crédito da execução. Roda DEPOIS de o job e a métrica
   * estarem gravados e nunca lança: se falhar, a reserva continua HELD (a
   * liquidação é idempotente) e o job não é reprocessado nem cobrado de novo.
   * Logs só com ids e códigos, nunca com a mensagem do erro.
   */
  private async settleCredit(
    job: { id: string; creditRun?: number },
    decide: () => CreditSettlement | null,
  ): Promise<void> {
    if (!this.creditsEnforced) {
      return;
    }

    let settlement: CreditSettlement | null = null;

    try {
      settlement = decide();
      if (!settlement) {
        return;
      }

      const key = creditRunKey(job);
      if (settlement.action === 'consume') {
        await this.credits.consume(key);
      } else {
        await this.credits.release(key, settlement.reason);
      }

      this.logger.log(
        `CREDIT_SETTLED ${JSON.stringify({
          jobId: job.id,
          creditRun: job.creditRun ?? 1,
          action: settlement.action,
          reason: settlement.action === 'release' ? settlement.reason : null,
        })}`,
      );
    } catch (error) {
      this.logger.error(
        `CREDIT_SETTLE_FAILED ${JSON.stringify({
          jobId: job.id,
          action: settlement?.action ?? 'decide',
          errorName: this.errorName(error),
        })}`,
      );
    }
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : 'UnknownError';
  }

  private toRunOutcome(outcome: FailOutcome): OcrRunOutcome {
    switch (outcome) {
      case 'retry_scheduled':
        return OcrRunOutcome.RETRY_SCHEDULED;
      case 'failed_final':
        return OcrRunOutcome.FAILED_FINAL;
      default:
        return OcrRunOutcome.DISCARDED;
    }
  }

  // Métrica da POC: apenas números, ids, status e categoria (sem dados da conta)
  private logJobMetric(
    job: { id: string; billId: string; attempts: number },
    queueWaitMs: number,
    totalMs: number,
    items: number,
    status: 'completed' | 'failed' | 'discarded',
    errorCategory: string | null,
  ) {
    this.logger.log(
      `OCR_METRIC ${JSON.stringify({
        stage: 'job',
        jobId: job.id,
        billId: job.billId,
        attempt: job.attempts + 1,
        queueWaitMs,
        totalMs,
        items,
        status,
        errorCategory,
      })}`,
    );
  }

  private async getProcessableImageUrl(bill: {
    imageUrl: string | null;
    imageKey: string | null;
  }) {
    if (bill.imageKey && this.storage.isUsingS3()) {
      return this.storage.getSignedUrl(bill.imageKey);
    }

    return bill.imageUrl;
  }

  /**
   * Condição para sair de RUNNING: `attempts` só aumenta no claim, então a igualdade
   * prova que ninguém reivindicou o job depois desta execução. PENDING também vale
   * (lock liberado por releaseStaleLocks sem novo claim) para não perder um
   * resultado já pago.
   */
  private executionWhere(
    jobId: string,
    execution: OcrExecution,
  ): Prisma.OcrJobWhereInput {
    return {
      id: jobId,
      attempts: execution.token,
      status: { in: [OcrJobStatus.RUNNING, OcrJobStatus.PENDING] },
    };
  }

  // Se a conta passou a apontar para outra imagem enquanto esta era lida, o job volta
  // para a fila com a imagem nova (e o resultado antigo não é gravado).
  private async requeueIfImageChanged(
    tx: Prisma.TransactionClient,
    jobId: string,
    billId: string,
    processedImageKey: string | null,
  ): Promise<boolean> {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      select: { status: true, imageKey: true },
    });

    if (
      !bill ||
      bill.status !== BillStatus.PENDING_OCR ||
      bill.imageKey === processedImageKey
    ) {
      return false;
    }

    await tx.ocrJob.updateMany({
      where: { id: jobId },
      data: {
        status: OcrJobStatus.PENDING,
        attempts: 0,
        lockedAt: null,
        startedAt: null,
        finishedAt: null,
        lastError: null,
        availableAt: new Date(),
        imageKey: bill.imageKey,
      },
    });

    return true;
  }

  private async persistOcrResult(
    jobId: string,
    billId: string,
    execution: OcrExecution,
    ocrResult: Awaited<ReturnType<OcrService['processImage']>>,
  ): Promise<PersistOutcome> {
    if (!OcrResultDto.validateOcrResult(ocrResult)) {
      // A conta só vira OCR_FAILED na falha final (failJob), nunca enquanto
      // houver retentativa. Aqui só guarda o texto bruto para diagnóstico.
      await this.prisma.bill.updateMany({
        where: {
          id: billId,
          status: BillStatus.PENDING_OCR,
          imageKey: execution.imageKey,
        },
        data: { ocrRawText: ocrResult.rawText },
      });

      throw new OcrInvalidResultError();
    }

    const items = ocrResult.items.map((item) => ({
      billId,
      name: item.name,
      quantity: item.quantity,
      measurementUnit: item.measurementUnit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    }));

    return this.prisma.$transaction(async (tx): Promise<PersistOutcome> => {
      // Gravação única: só quem ainda é o dono da execução conclui o job
      const completed = await tx.ocrJob.updateMany({
        where: this.executionWhere(jobId, execution),
        data: {
          status: OcrJobStatus.COMPLETED,
          lockedAt: null,
          finishedAt: new Date(),
          lastError: null,
        },
      });

      if (completed.count === 0) {
        return 'discarded_stale_execution';
      }

      // O resultado só vale para a imagem certa e para uma conta ainda aguardando OCR
      const billUpdated = await tx.bill.updateMany({
        where: {
          id: billId,
          status: BillStatus.PENDING_OCR,
          imageKey: execution.imageKey,
        },
        data: {
          status: BillStatus.REVIEWING,
          ocrRawText: ocrResult.rawText,
          totalAmount: ocrResult.totalAmount,
          establishmentName: ocrResult.establishmentName,
        },
      });

      if (billUpdated.count === 0) {
        return (await this.requeueIfImageChanged(
          tx,
          jobId,
          billId,
          execution.imageKey,
        ))
          ? 'requeued_new_image'
          : 'discarded_bill_changed';
      }

      await tx.billItem.deleteMany({ where: { billId } });

      if (items.length > 0) {
        await tx.billItem.createMany({ data: items });
      }

      return 'saved';
    });
  }

  private async failJob(
    jobId: string,
    billId: string,
    errorMessage: string,
    shouldRetry: boolean,
    durationMs: number,
    execution: OcrExecution,
  ): Promise<FailOutcome> {
    if (shouldRetry) {
      const rescheduled = await this.prisma.ocrJob.updateMany({
        where: this.executionWhere(jobId, execution),
        data: {
          status: OcrJobStatus.PENDING,
          lockedAt: null,
          availableAt: new Date(Date.now() + this.retryDelayMs),
          lastError: errorMessage,
        },
      });

      if (rescheduled.count === 0) {
        this.logger.warn(
          `OCR retry for bill ${billId} skipped: job was claimed by another execution.`,
        );
        return 'ignored';
      }

      this.metrics.recordOcrRetry();

      this.logger.warn(
        `OCR failed for bill ${billId}. Scheduled retry. Error: ${errorMessage}`,
      );
      return 'retry_scheduled';
    }

    const finalized = await this.prisma.$transaction(async (tx) => {
      const failed = await tx.ocrJob.updateMany({
        where: this.executionWhere(jobId, execution),
        data: {
          status: OcrJobStatus.FAILED,
          lockedAt: null,
          finishedAt: new Date(),
          lastError: errorMessage,
        },
      });

      if (failed.count === 0) {
        return false;
      }

      // A conta só vira OCR_FAILED aqui, na falha final, e se ainda espera esta imagem
      const billFailed = await tx.bill.updateMany({
        where: {
          id: billId,
          status: BillStatus.PENDING_OCR,
          imageKey: execution.imageKey,
        },
        data: { status: BillStatus.OCR_FAILED },
      });

      if (billFailed.count === 0) {
        await this.requeueIfImageChanged(tx, jobId, billId, execution.imageKey);
      }

      return true;
    });

    if (!finalized) {
      this.logger.warn(
        `OCR failure for bill ${billId} ignored: job was claimed by another execution.`,
      );
      return 'ignored';
    }

    this.metrics.recordOcrFailed(durationMs, errorMessage);
    this.logger.error(`OCR failed for bill ${billId}: ${errorMessage}`);
    return 'failed_final';
  }

  async getQueueSnapshot() {
    const [pending, running, failed, completed] = await Promise.all([
      this.prisma.ocrJob.count({ where: { status: OcrJobStatus.PENDING } }),
      this.prisma.ocrJob.count({ where: { status: OcrJobStatus.RUNNING } }),
      this.prisma.ocrJob.count({ where: { status: OcrJobStatus.FAILED } }),
      this.prisma.ocrJob.count({ where: { status: OcrJobStatus.COMPLETED } }),
    ]);

    return {
      pending,
      running,
      failed,
      completed,
      activeWorkers: this.activeWorkers,
      maxConcurrency: this.maxConcurrency,
      maxJobsPerRun: this.maxJobsPerRun,
      maxAttempts: this.maxAttempts,
      retryDelayMs: this.retryDelayMs,
      lockTimeoutMs: this.lockTimeoutMs,
    };
  }
}
