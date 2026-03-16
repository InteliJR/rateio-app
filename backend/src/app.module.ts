import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TokenRevocationModule } from './token-revocation/token-revocation.module';
import { CommonModule } from './common/common.module';
import { StorageModule } from './storage/storage.module';
import { OcrModule } from './ocr/ocr.module';
import { BillsModule } from './bills/bills.module';
import { BillItemsModule } from './bill-items/bill-items.module';
import { ParticipantsModule } from './participants/participants.module';
import { DivisionsModule } from './divisions/divisions.module';
import { FeesModule } from './fees/fees.module';
import { ObservabilityModule } from './observability/observability.module';
import { MetricsInterceptor } from './observability/metrics.interceptor';

function getRateLimitConfig() {
  const ttl = Number(process.env.THROTTLE_TTL_MS ?? 60000);
  const limit = Number(process.env.THROTTLE_LIMIT ?? 120);

  return {
    ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : 60000,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 120,
  };
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Global rate limiting should be lenient enough for normal app usage.
    ThrottlerModule.forRoot([
      getRateLimitConfig(),
    ]),
    ObservabilityModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    TokenRevocationModule,
    CommonModule,
    StorageModule,
    OcrModule,
    BillsModule,
    BillItemsModule,
    ParticipantsModule,
    DivisionsModule,
    FeesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {}
