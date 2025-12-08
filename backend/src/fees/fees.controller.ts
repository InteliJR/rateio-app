import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { FeesService } from './fees.service';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('fees')
@UseGuards(JwtAuthGuard)
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  /**
   * Criar taxa
   */
  @Post()
  create(@Body() createFeeDto: CreateFeeDto, @Request() req: any) {
    return this.feesService.create(req.user.id, createFeeDto);
  }

  /**
   * Listar taxas de uma conta
   */
  @Get()
  findAllByBill(@Query('billId') billId: string, @Request() req: any) {
    return this.feesService.findAllByBill(billId, req.user.id);
  }

  /**
   * Buscar taxa específica
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.feesService.findOne(id, req.user.id);
  }

  /**
   * Atualizar taxa
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateFeeDto: UpdateFeeDto,
    @Request() req: any,
  ) {
    return this.feesService.update(id, req.user.id, updateFeeDto);
  }

  /**
   * Deletar taxa
   */
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.feesService.remove(id, req.user.id);
  }
}
