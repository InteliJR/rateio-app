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
import { FreightsService } from './freights.service';
import { CreateFreightDto } from './dto/create-freight.dto';
import { UpdateFreightDto } from './dto/update-freight.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('freights')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.LOGISTICA) // Apenas ADMIN e LOGISTICA acessam frete
export class FreightsController {
  constructor(private readonly freightsService: FreightsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.LOGISTICA)
  create(@Body() createFreightDto: CreateFreightDto) {
    return this.freightsService.create(createFreightDto);
  }

  @Get()
  findAll() {
    return this.freightsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.freightsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.LOGISTICA)
  update(@Param('id') id: string, @Body() updateFreightDto: UpdateFreightDto) {
    return this.freightsService.update(id, updateFreightDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.freightsService.remove(id);
  }
}
