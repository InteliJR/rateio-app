import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { OcrQueueService } from './ocr-queue.service';

@Controller('internal/ocr')
export class OcrInternalController {
  constructor(private readonly ocrQueue: OcrQueueService) {}

  @SkipThrottle()
  @Get('queue')
  async getQueueStatus(@Headers('x-internal-cron-secret') secret?: string) {
    this.assertSecret(secret);
    return this.ocrQueue.getQueueSnapshot();
  }

  @SkipThrottle()
  @Post('process-pending')
  @HttpCode(HttpStatus.OK)
  async processPending(@Headers('x-internal-cron-secret') secret?: string) {
    this.assertSecret(secret);
    return this.ocrQueue.processPendingJobs();
  }

  private assertSecret(secret?: string) {
    const configuredSecret = process.env.INTERNAL_CRON_SECRET;

    if (!configuredSecret) {
      throw new ForbiddenException(
        'INTERNAL_CRON_SECRET não configurado no ambiente.',
      );
    }

    if (!secret || secret !== configuredSecret) {
      throw new ForbiddenException('Credencial interna inválida.');
    }
  }
}
