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
import { ParticipantsService } from './participants.service';
import { CreateParticipantDto } from './dto/create-participant.dto';
import { UpdateParticipantDto } from './dto/update-participant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('participants')
@UseGuards(JwtAuthGuard)
export class ParticipantsController {
  constructor(private readonly participantsService: ParticipantsService) {}

  /**
   * Criar participante
   */
  @Post()
  create(
    @Body() createParticipantDto: CreateParticipantDto,
    @Request() req: any,
  ) {
    return this.participantsService.create(req.user.id, createParticipantDto);
  }

  /**
   * Listar participantes de uma conta
   */
  @Get()
  findAllByBill(@Query('billId') billId: string, @Request() req: any) {
    return this.participantsService.findAllByBill(billId, req.user.id);
  }

  /**
   * Buscar participante específico
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.participantsService.findOne(id, req.user.id);
  }

  /**
   * Atualizar participante
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateParticipantDto: UpdateParticipantDto,
    @Request() req: any,
  ) {
    return this.participantsService.update(
      id,
      req.user.id,
      updateParticipantDto,
    );
  }

  /**
   * Deletar participante
   */
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.participantsService.remove(id, req.user.id);
  }
}
