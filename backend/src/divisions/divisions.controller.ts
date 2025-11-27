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
import { DivisionsService } from './divisions.service';
import {
  CreateDivisionDto,
  CreateBatchDivisionDto,
} from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('divisions')
@UseGuards(JwtAuthGuard)
export class DivisionsController {
  constructor(private readonly divisionsService: DivisionsService) {}

  /**
   * Criar divisão única
   */
  @Post()
  create(@Body() createDivisionDto: CreateDivisionDto, @Request() req: any) {
    return this.divisionsService.create(req.user.id, createDivisionDto);
  }

  /**
   * Criar múltiplas divisões de um item
   */
  @Post('batch')
  createBatch(
    @Body() createBatchDivisionDto: CreateBatchDivisionDto,
    @Request() req: any,
  ) {
    return this.divisionsService.createBatch(
      req.user.id,
      createBatchDivisionDto,
    );
  }

  /**
   * Listar todas as divisões de uma conta
   */
  @Get()
  findAllByBill(@Query('billId') billId: string, @Request() req: any) {
    return this.divisionsService.findAllByBill(billId, req.user.id);
  }

  /**
   * Buscar divisão específica
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.divisionsService.findOne(id, req.user.id);
  }

  /**
   * Atualizar valor da divisão
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDivisionDto: UpdateDivisionDto,
    @Request() req: any,
  ) {
    return this.divisionsService.update(id, req.user.id, updateDivisionDto);
  }

  /**
   * Remover divisão
   */
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.divisionsService.remove(id, req.user.id);
  }
}
