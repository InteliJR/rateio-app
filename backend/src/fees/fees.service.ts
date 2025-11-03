import { Injectable } from '@nestjs/common';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';

@Injectable()
export class FeesService {
  create(createFeeDto: CreateFeeDto) {
    return 'This action adds a new fee';
  }

  findAll() {
    return `This action returns all fees`;
  }

  findOne(id: number) {
    return `This action returns a #${id} fee`;
  }

  update(id: number, updateFeeDto: UpdateFeeDto) {
    return `This action updates a #${id} fee`;
  }

  remove(id: number) {
    return `This action removes a #${id} fee`;
  }
}
