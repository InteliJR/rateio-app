import { Injectable } from '@nestjs/common';
import { CreateFreightDto } from './dto/create-freight.dto';
import { UpdateFreightDto } from './dto/update-freight.dto';

@Injectable()
export class FreightsService {
  create(createFreightDto: CreateFreightDto) {
    return 'This action adds a new freight';
  }

  findAll() {
    return `This action returns all freights`;
  }

  findOne(id: string) {
    return `This action returns a #${id} freight`;
  }

  update(id: string, updateFreightDto: UpdateFreightDto) {
    return `This action updates a #${id} freight`;
  }

  remove(id: string) {
    return `This action removes a #${id} freight`;
  }
}
