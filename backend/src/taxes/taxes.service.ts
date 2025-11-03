import { Injectable } from '@nestjs/common';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';

@Injectable()
export class TaxesService {
  create(createTaxDto: CreateTaxDto) {
    return 'This action adds a new tax';
  }

  findAll() {
    return `This action returns all taxes`;
  }

  findOne(id: string) {
    return `This action returns a #${id} tax`;
  }

  update(id: string, updateTaxDto: UpdateTaxDto) {
    return `This action updates a #${id} tax`;
  }

  remove(id: string) {
    return `This action removes a #${id} tax`;
  }
}
