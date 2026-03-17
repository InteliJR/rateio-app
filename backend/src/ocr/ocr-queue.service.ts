import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillStatus, OcrJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { OcrResultDto } from './dto/ocr-result.dto';
import { OcrService } from './ocr.service';

@Injectable()
export class OcrQueueService {
  private readonly logger = new Logger(OcrQueueService.name);
  private readonly maxConcurrency = Number(process.env.OCR_QUEUE_CONCURRENCY ?? 2);
  private readonly maxAttempts = Number(process.env.OCR_QUEUE_MAX_ATTEMPTS ?? 3);
  private readonly retryDelayMs = Number(process.env.OCR_QUEUE_RETRY_DELAY_MS ?? 30000);
  private readonly lockTimeoutMs = Number(process.env.OCR_QUEUE_LOCK_TIMEOUT_MS ?? 120000);
  private activeWorkers = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly metrics: MetricsService,
  ) {}

  async enqueue(billId: string, userId: string) {
    await this.prisma.ocrJob.upsert({
      where: { billId },
      create: {
        billId,
        userId,
        status: OcrJobStatus.PENDING,
      },
      update: {
        userId,
        status: OcrJobStatus.PENDING,
        attempts: 0,
        lockedAt: null,
        startedAt: null,
        finishedAt: null,
        lastError: null,
        availableAt: new Date(),
      },
    });

    this.metrics.recordOcrQueued();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async pollQueue() {
    if (process.env.VERCEL) {
      return;
    }

    await this.processPendingJobs();
  }

  async processPendingJobs() {
    await this.releaseStaleLocks();

    const availableSlots = Math.max(this.maxConcurrency - this.activeWorkers, 0);
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
          },
        },
      },
    });

    if (!job) {
      return null;
    }

    const updated = await this.prisma.ocrJob.updateMany({
      where: {
        id: job.id,
        status: OcrJobStatus.PENDING,
      },
      data: {
        status: OcrJobStatus.RUNNING,
        attempts: { increment: 1 },
        lockedAt: new Date(),
        startedAt: new Date(),
        lastError: null,
      },
    });

    if (updated.count === 0) {
      return null;
    }

    return job;
  }

  private async runJob(job: {
    id: string;
    billId: string;
    attempts: number;
    bill: { id: string; imageUrl: string | null };
  }) {
    if (!job.bill.imageUrl) {
      await this.failJob(job.id, job.billId, 'Bill has no image URL for OCR.', false, 0);
      return;
    }

    const startedAt = Date.now();
    this.metrics.recordOcrStarted();

    try {
      const ocrResult = await this.ocrService.processImage(job.bill.imageUrl);
      await this.persistOcrResult(job.billId, ocrResult);

      const durationMs = Date.now() - startedAt;
      this.metrics.recordOcrCompleted(durationMs);

      await this.prisma.ocrJob.update({
        where: { id: job.id },
        data: {
          status: OcrJobStatus.COMPLETED,
          lockedAt: null,
          finishedAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(`OCR completed for bill ${job.billId} in ${durationMs}ms.`);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown OCR processing error';
      const shouldRetry = job.attempts + 1 < this.maxAttempts;

      await this.failJob(job.id, job.billId, errorMessage, shouldRetry, durationMs);
    }
  }

  private async persistOcrResult(
    billId: string,
    ocrResult: Awaited<ReturnType<OcrService['processImage']>>,
  ) {
    if (!OcrResultDto.validateOcrResult(ocrResult)) {
      await this.prisma.bill.update({
        where: { id: billId },
        data: {
          status: BillStatus.OCR_FAILED,
          ocrRawText: ocrResult.rawText,
        },
      });

      throw new Error('OCR returned invalid structured data.');
    }

    const items = ocrResult.items.map((item) => ({
      billId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.billItem.deleteMany({ where: { billId } });

      if (items.length > 0) {
        await tx.billItem.createMany({ data: items });
      }

      await tx.bill.update({
        where: { id: billId },
        data: {
          status: BillStatus.REVIEWING,
          ocrRawText: ocrResult.rawText,
          totalAmount: ocrResult.totalAmount,
          establishmentName: ocrResult.establishmentName,
        },
      });
    });
  }

  private async failJob(
    jobId: string,
    billId: string,
    errorMessage: string,
    shouldRetry: boolean,
    durationMs: number,
  ) {
    if (shouldRetry) {
      this.metrics.recordOcrRetry();

      await this.prisma.ocrJob.update({
        where: { id: jobId },
        data: {
          status: OcrJobStatus.PENDING,
          lockedAt: null,
          availableAt: new Date(Date.now() + this.retryDelayMs),
          lastError: errorMessage,
        },
      });

      this.logger.warn(
        `OCR failed for bill ${billId}. Scheduled retry. Error: ${errorMessage}`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bill.update({
        where: { id: billId },
        data: {
          status: BillStatus.OCR_FAILED,
        },
      });

      await tx.ocrJob.update({
        where: { id: jobId },
        data: {
          status: OcrJobStatus.FAILED,
          lockedAt: null,
          finishedAt: new Date(),
          lastError: errorMessage,
        },
      });
    });

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
      maxAttempts: this.maxAttempts,
      retryDelayMs: this.retryDelayMs,
      lockTimeoutMs: this.lockTimeoutMs,
    };
  }
}
