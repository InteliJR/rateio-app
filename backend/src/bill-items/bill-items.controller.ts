import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BillItemsService } from './bill-items.service';
import { CreateBillItemDto } from './dto/create-bill-item.dto';
import { UpdateBillItemDto } from './dto/update-bill-item.dto';

@Controller('bill-items')
export class BillItemsController {
  constructor(private readonly billItemsService: BillItemsService) {}

  @Post()
  create(@Body() createBillItemDto: CreateBillItemDto) {
    return this.billItemsService.create(createBillItemDto);
  }

  @Get()
  findAll() {
    return this.billItemsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.billItemsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBillItemDto: UpdateBillItemDto) {
    return this.billItemsService.update(+id, updateBillItemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.billItemsService.remove(+id);
  }
}
