import { Injectable } from '@nestjs/common';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';

@Injectable()
export class DivisionsService {
  create(createDivisionDto: CreateDivisionDto) {
    return 'This action adds a new division';
  }

  findAll() {
    return `This action returns all divisions`;
  }

  findOne(id: number) {
    return `This action returns a #${id} division`;
  }

  update(id: number, updateDivisionDto: UpdateDivisionDto) {
    return `This action updates a #${id} division`;
  }

  remove(id: number) {
    return `This action removes a #${id} division`;
  }
}
