import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreditBalance,
  CreditHistoryPage,
  CreditsService,
} from './credits.service';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  /**
   * Saldo do usuário autenticado. É o que o aplicativo consulta para mostrar
   * quantas leituras restam e para decidir se abre a tela de saldo insuficiente.
   */
  @Get('balance')
  getBalance(@Request() req: { user: { id: string } }): Promise<CreditBalance> {
    return this.creditsService.getBalance(req.user.id);
  }

  /** Histórico resumido do usuário autenticado, do mais recente para o mais antigo. */
  @Get('transactions')
  getHistory(
    @Request() req: { user: { id: string } },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<CreditHistoryPage> {
    return this.creditsService.getHistory(
      req.user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
