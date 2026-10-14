import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditBalance, CreditsService } from './credits.service';

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
}
