import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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

@Module({
  imports: [
    // Rate Limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
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
  ],
})
export class AppModule {}
