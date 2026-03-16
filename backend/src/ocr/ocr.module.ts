import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ObservabilityModule } from '../observability/observability.module';
import { OcrInternalController } from './ocr-internal.controller';
import { OcrQueueService } from './ocr-queue.service';
import { OcrService } from './ocr.service';

@Module({
  imports: [PrismaModule, ObservabilityModule],
  controllers: [OcrInternalController],
  providers: [OcrService, OcrQueueService],
  exports: [OcrService, OcrQueueService],
})
export class OcrModule {}
