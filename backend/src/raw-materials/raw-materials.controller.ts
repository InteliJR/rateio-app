import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RawMaterialsService } from './raw-materials.service';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { UpdateRawMaterialDto } from './dto/update-raw-material.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('raw-materials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COMERCIAL) // Apenas ADMIN e COMERCIAL acessam matérias-primas
export class RawMaterialsController {
  constructor(private readonly rawMaterialsService: RawMaterialsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.COMERCIAL)
  create(@Body() createRawMaterialDto: CreateRawMaterialDto) {
    return this.rawMaterialsService.create(createRawMaterialDto);
  }

  @Get()
  findAll() {
    return this.rawMaterialsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rawMaterialsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.COMERCIAL)
  update(
    @Param('id') id: string,
    @Body() updateRawMaterialDto: UpdateRawMaterialDto,
  ) {
    return this.rawMaterialsService.update(id, updateRawMaterialDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.rawMaterialsService.remove(id);
  }
}
