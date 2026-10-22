import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminCreditsController } from './admin-credits.controller';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

@Module({
  imports: [PrismaModule],
  controllers: [CreditsController, AdminCreditsController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
