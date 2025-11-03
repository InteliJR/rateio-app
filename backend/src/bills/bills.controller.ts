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
