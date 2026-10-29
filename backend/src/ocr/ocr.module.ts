import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { ObservabilityModule } from '../observability/observability.module';
import { StorageModule } from '../storage/storage.module';
import { CreditsModule } from '../credits/credits.module';
import { InsufficientCreditsFilter } from './insufficient-credits.filter';
import { OcrInternalController } from './ocr-internal.controller';
import { OcrQueueService } from './ocr-queue.service';
import { OcrService } from './ocr.service';

@Module({
  imports: [PrismaModule, ObservabilityModule, StorageModule, CreditsModule],
  controllers: [OcrInternalController],
  providers: [
    OcrService,
    OcrQueueService,
    // Saldo insuficiente na reserva vira 402 (BUG-016), em qualquer rota
    { provide: APP_FILTER, useClass: InsufficientCreditsFilter },
  ],
  exports: [OcrService, OcrQueueService],
})
export class OcrModule {}
