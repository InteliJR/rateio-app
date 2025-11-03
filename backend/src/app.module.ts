import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TokenRevocationModule } from './token-revocation/token-revocation.module';
import { TaxesModule } from './taxes/taxes.module';
import { FreightsModule } from './freights/freights.module';
import { RawMaterialsModule } from './raw-materials/raw-materials.module';
import { ProductsModule } from './products/products.module';
import { FixedCostsModule } from './fixed-costs/fixed-costs.module';
import { CommonModule } from './common/common.module';
import { ExportModule } from './export/export.module';

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
    TaxesModule,
    FreightsModule,
    RawMaterialsModule,
    ProductsModule,
    FixedCostsModule,
    CommonModule,
    ExportModule,
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
