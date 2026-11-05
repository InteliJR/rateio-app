import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreditBalance,
  CreditHistoryPage,
  CreditsService,
} from './credits.service';
import { AdjustCreditsDto } from './dto/adjust-credits.dto';

type RequestWithUser = { user: { id: string } };

@Controller('credits')
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  /**
   * Saldo do usuário autenticado. É o que o aplicativo consulta para mostrar
   * quantas leituras restam e para decidir se abre a tela de saldo insuficiente.
   */
  @UseGuards(JwtAuthGuard)
  @Get('balance')
  getBalance(@Request() req: RequestWithUser): Promise<CreditBalance> {
    return this.creditsService.getBalance(req.user.id);
  }

  /**
   * Histórico de movimentações do usuário autenticado, da mais recente para a
   * mais antiga. Explica cada mudança de saldo.
   */
  @UseGuards(JwtAuthGuard)
  @Get('history')
  getHistory(
    @Request() req: RequestWithUser,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<CreditHistoryPage> {
    return this.creditsService.getHistory(req.user.id, { cursor, limit });
  }

  /**
   * Ajuste manual do suporte. Registra autor, motivo e data no ledger, e por
   * isso fica auditável depois.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':userId/adjust')
  adjust(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(ValidationPipe) dto: AdjustCreditsDto,
    @Request() req: RequestWithUser,
  ) {
    return this.creditsService.adminAdjust({
      userId,
      amount: dto.amount,
      reason: dto.reason,
      actorId: req.user.id,
      reference: dto.reference,
    });
  }
}
