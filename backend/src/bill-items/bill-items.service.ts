import { Injectable } from '@nestjs/common';
import { CreateBillItemDto } from './dto/create-bill-item.dto';
import { UpdateBillItemDto } from './dto/update-bill-item.dto';

@Injectable()
export class BillItemsService {
  create(createBillItemDto: CreateBillItemDto) {
    return 'This action adds a new billItem';
  }

  findAll() {
    return `This action returns all billItems`;
  }

  findOne(id: number) {
    return `This action returns a #${id} billItem`;
  }

  update(id: number, updateBillItemDto: UpdateBillItemDto) {
    return `This action updates a #${id} billItem`;
  }

  remove(id: number) {
    return `This action removes a #${id} billItem`;
  }
}
