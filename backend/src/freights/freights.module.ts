import { Module } from '@nestjs/common';
import { FreightsService } from './freights.service';
import { FreightsController } from './freights.controller';

@Module({
  controllers: [FreightsController],
  providers: [FreightsService],
})
export class FreightsModule {}
