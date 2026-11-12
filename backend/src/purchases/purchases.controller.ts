import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { VerifyGooglePurchaseDto } from './dto/verify-google-purchase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('purchases')
@UseGuards(JwtAuthGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  /**
   * Validar compra do Google Play e creditar (uma única vez por token)
   */
  @Post('google')
  verifyGoogle(@Body() dto: VerifyGooglePurchaseDto, @Request() req: any) {
    return this.purchasesService.verifyGooglePurchase(req.user.id, dto);
  }

  /**
   * Reprocessar compras pendentes ou sem consumo
   */
  @Post('reconcile')
  reconcile(@Request() req: any) {
    return this.purchasesService.reconcile(req.user.id);
  }
}
