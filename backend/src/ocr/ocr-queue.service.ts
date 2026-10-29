import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillStatus, OcrJob, OcrJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { OcrResultDto } from './dto/ocr-result.dto';
import { OcrService } from './ocr.service';
import { StorageService } from '../storage/storage.service';

// Identifica uma execução do job: `token` é o valor de `attempts` logo após o claim
// e `imageKey` é a imagem que está sendo lida.
type OcrExecution = { token: number; imageKey: string | null };

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly metrics: MetricsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Enfileira a leitura de uma conta sem reiniciar um job ativo:
   * - sem job: cria;
   * - FAILED: recria;
   * - COMPLETED: recria só se a imagem mudou (ou em `reprocess`, pedido explícito);
   * - PENDING: mantém e apenas aponta para a imagem mais recente;
   * - RUNNING: não muda; o resultado é conferido quando o job terminar.
   * `enqueued` diz se há trabalho novo (criado ou recriado) e não apenas reaproveitado.
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
      this.metrics.recordOcrQueued();
      return {
        job: await client.ocrJob.findUniqueOrThrow({ where: { billId } }),
        enqueued: true,
      };
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
      },
    });

    if (requeued.count === 1) {
      this.metrics.recordOcrQueued();
      return {
        job: await client.ocrJob.findUniqueOrThrow({ where: { billId } }),
        enqueued: true,
      };
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
    };
  }

  private async runJob(job: {
    id: string;
    billId: string;
    attempts: number;
    availableAt: Date;
    imageKey?: string | null;
    claimToken?: number;
    bill: { id: string; imageUrl: string | null; imageKey: string | null };
  }) {
    const jobStartedAt = Date.now();
    const queueWaitMs = jobStartedAt - job.availableAt.getTime();
    const execution: OcrExecution = {
      token: job.claimToken ?? job.attempts + 1,
      imageKey: job.imageKey !== undefined ? job.imageKey : job.bill.imageKey,
    };
    const imageUrl = await this.getProcessableImageUrl(job.bill);

    if (!imageUrl) {
      await this.failJob(
        job.id,
        job.billId,
        'Bill has no image URL for OCR.',
        false,
        0,
        execution,
      );
      this.logJobMetric(job, queueWaitMs, jobStartedAt, 0, 'failed');
      return;
    }

    const startedAt = Date.now();
    this.metrics.recordOcrStarted();

    try {
      const ocrResult = await this.ocrService.processImage(imageUrl, {
        jobId: job.id,
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
        this.logJobMetric(job, queueWaitMs, jobStartedAt, 0, 'discarded');
        return;
      }

      const durationMs = Date.now() - startedAt;
      this.metrics.recordOcrCompleted(durationMs);

      this.logger.log(
        `OCR completed for bill ${job.billId} in ${durationMs}ms.`,
      );
      this.logJobMetric(
        job,
        queueWaitMs,
        jobStartedAt,
        ocrResult.items.length,
        'completed',
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown OCR processing error';
      const shouldRetry = job.attempts + 1 < this.maxAttempts;

      await this.failJob(
        job.id,
        job.billId,
        errorMessage,
        shouldRetry,
        durationMs,
        execution,
      );
      this.logJobMetric(job, queueWaitMs, jobStartedAt, 0, 'failed');
    }
  }

  // Métrica da POC: apenas números, ids e status (sem dados da conta)
  private logJobMetric(
    job: { id: string; billId: string; attempts: number },
    queueWaitMs: number,
    jobStartedAt: number,
    items: number,
    status: 'completed' | 'failed' | 'discarded',
  ) {
    this.logger.log(
      `OCR_METRIC ${JSON.stringify({
        stage: 'job',
        jobId: job.id,
        billId: job.billId,
        attempt: job.attempts + 1,
        queueWaitMs,
        totalMs: Date.now() - jobStartedAt,
        items,
        status,
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

      throw new Error('OCR returned invalid structured data.');
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
  ) {
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
        return;
      }

      this.metrics.recordOcrRetry();

      this.logger.warn(
        `OCR failed for bill ${billId}. Scheduled retry. Error: ${errorMessage}`,
      );
      return;
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
      return;
    }

    this.metrics.recordOcrFailed(durationMs, errorMessage);
    this.logger.error(`OCR failed for bill ${billId}: ${errorMessage}`);
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
