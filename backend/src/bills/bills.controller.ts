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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BillsService } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FinalizeBillDto } from './dto/finalize-bill.dto';
import { CreateBillItemDto } from '../bill-items/dto/create-bill-item.dto';
import { UpdateBillItemDto } from '../bill-items/dto/update-bill-item.dto';
import { BatchUpdateBillItemsDto } from './dto/update-bill.dto';
import { CreateFeeDto } from '../fees/dto/create-fee.dto';

@Controller('bills')
@UseGuards(JwtAuthGuard)
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  /**
   * Upload de foto da conta + OCR automático
   */
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() createBillDto: CreateBillDto,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Imagem da conta é obrigatória');
    }

    return this.billsService.create(file, req.user.id, createBillDto);
  }

  /**
   * Listar contas do usuário
   */
  @Get()
  findAll(@Request() req: any) {
    return this.billsService.findAllByUser(req.user.id);
  }

  /**
   * Retornar resumo da conta com valores por participante
   */
  @Get(':id/summary')
  getSummary(@Param('id') id: string, @Request() req: any) {
    return this.billsService.getSummary(id, req.user.id);
  }

  /**
   * Criar item individual
   */
  @Post(':id/items')
  createItem(
    @Param('id') billId: string,
    @Body() createBillItemDto: CreateBillItemDto,
    @Request() req: any,
  ) {
    return this.billsService.createItem(billId, req.user.id, createBillItemDto);
  }

  /**
   * Atualizar itens em lote
   */
  @Patch(':id/items')
  batchUpdateItems(
    @Param('id') billId: string,
    @Body() batchUpdateDto: BatchUpdateBillItemsDto,
    @Request() req: any,
  ) {
    return this.billsService.batchUpdateItems(billId, req.user.id, batchUpdateDto);
  }

  /**
   * Atualizar item individual
   */
  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') billId: string,
    @Param('itemId') itemId: string,
    @Body() updateBillItemDto: UpdateBillItemDto,
    @Request() req: any,
  ) {
    return this.billsService.updateItem(
      billId,
      itemId,
      req.user.id,
      updateBillItemDto,
    );
  }

  /**
   * Deletar item individual
   */
  @Delete(':id/items/:itemId')
  deleteItem(
    @Param('id') billId: string,
    @Param('itemId') itemId: string,
    @Request() req: any,
  ) {
    return this.billsService.deleteItem(billId, itemId, req.user.id);
  }

  /**
   * Criar taxa/couvert
   */
  @Post(':id/fees')
  createFee(
    @Param('id') billId: string,
    @Body() createFeeDto: CreateFeeDto,
    @Request() req: any,
  ) {
    // Preencher billId da URL no DTO antes de validar
    createFeeDto.billId = billId;
    return this.billsService.createFee(billId, req.user.id, createFeeDto);
  }

  /**
   * Finalizar divisão da conta
   */
  @Post(':id/finalize')
  finalize(
    @Param('id') id: string,
    @Body() finalizeBillDto: FinalizeBillDto,
    @Request() req: any,
  ) {
    return this.billsService.finalize(id, req.user.id, finalizeBillDto);
  }

  /**
   * Buscar conta específica
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.billsService.findOne(id, req.user.id);
  }

  /**
   * Atualizar conta (status, itens, etc)
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateBillDto: UpdateBillDto,
    @Request() req: any,
  ) {
    return this.billsService.update(id, req.user.id, updateBillDto);
  }

  /**
   * Deletar conta (e imagem do S3)
   */
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.billsService.remove(id, req.user.id);
  }
}
