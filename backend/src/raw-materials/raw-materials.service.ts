import { Injectable } from '@nestjs/common';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { UpdateRawMaterialDto } from './dto/update-raw-material.dto';

@Injectable()
export class RawMaterialsService {
  create(createRawMaterialDto: CreateRawMaterialDto) {
    return 'This action adds a new rawMaterial';
  }

  findAll() {
    return `This action returns all rawMaterials`;
  }

  findOne(id: string) {
    return `This action returns a #${id} rawMaterial`;
  }

  update(id: string, updateRawMaterialDto: UpdateRawMaterialDto) {
    return `This action updates a #${id} rawMaterial`;
  }

  remove(id: string) {
    return `This action removes a #${id} rawMaterial`;
  }
}
