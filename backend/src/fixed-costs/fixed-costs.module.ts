import { Module } from '@nestjs/common';
import { FixedCostsService } from './fixed-costs.service';
import { FixedCostsController } from './fixed-costs.controller';

@Module({
  controllers: [FixedCostsController],
  providers: [FixedCostsService],
})
export class FixedCostsModule {}
