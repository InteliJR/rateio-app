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
import { FixedCostsService } from './fixed-costs.service';
import { CreateFixedCostDto } from './dto/create-fixed-cost.dto';
import { UpdateFixedCostDto } from './dto/update-fixed-cost.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('fixed-costs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN) // Apenas ADMIN acessa custos fixos
export class FixedCostsController {
  constructor(private readonly fixedCostsService: FixedCostsService) {}

  @Post()
  create(@Body() createFixedCostDto: CreateFixedCostDto) {
    return this.fixedCostsService.create(createFixedCostDto);
  }

  @Get()
  findAll() {
    return this.fixedCostsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fixedCostsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateFixedCostDto: UpdateFixedCostDto,
  ) {
    return this.fixedCostsService.update(id, updateFixedCostDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.fixedCostsService.remove(id);
  }
}
