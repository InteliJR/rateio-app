import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CreditsModule } from '../credits/credits.module';
import { GooglePlayVerifier } from './google-play-verifier';
import { createGooglePlayVerifier } from './google-play-verifier.factory';
import { CreditsGranter, LedgerCreditsGranter } from './credits-granter';

@Module({
  imports: [PrismaModule, CreditsModule],
  controllers: [PurchasesController],
  providers: [
    PurchasesService,
    { provide: GooglePlayVerifier, useFactory: createGooglePlayVerifier },
    { provide: CreditsGranter, useClass: LedgerCreditsGranter },
  ],
  exports: [PurchasesService],
})
export class PurchasesModule {}
