import { Module } from '@nestjs/common';
import { BillItemsService } from './bill-items.service';
import { BillItemsController } from './bill-items.controller';

@Module({
  controllers: [BillItemsController],
  providers: [BillItemsService],
})
export class BillItemsModule {}
