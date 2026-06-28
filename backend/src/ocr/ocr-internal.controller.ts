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
  async getQueueStatus(
    @Headers('x-internal-cron-secret') secret?: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.assertSecret(secret, authorization);
    return this.ocrQueue.getQueueSnapshot();
  }

  @SkipThrottle()
  @Get('process-pending')
  @HttpCode(HttpStatus.OK)
  async processPendingByCron(
    @Headers('x-internal-cron-secret') secret?: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.assertSecret(secret, authorization);
    return this.ocrQueue.processPendingJobs();
  }

  @SkipThrottle()
  @Post('process-pending')
  @HttpCode(HttpStatus.OK)
  async processPending(
    @Headers('x-internal-cron-secret') secret?: string,
    @Headers('authorization') authorization?: string,
  ) {
    this.assertSecret(secret, authorization);
    return this.ocrQueue.processPendingJobs();
  }

  private assertSecret(secret?: string, authorization?: string) {
    const configuredSecrets = [
      process.env.INTERNAL_CRON_SECRET,
      process.env.CRON_SECRET,
    ].filter((value): value is string => Boolean(value));
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;

    if (configuredSecrets.length === 0) {
      throw new ForbiddenException(
        'INTERNAL_CRON_SECRET or CRON_SECRET is not configured.',
      );
    }

    if (
      !configuredSecrets.includes(secret || '') &&
      !configuredSecrets.includes(bearerToken || '')
    ) {
      throw new ForbiddenException('Invalid internal credential.');
    }
  }
}
