import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
  Request,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  AdminAdjustResult,
  CreditsService,
  IdempotencyKeyConflictError,
  NegativeBalanceError,
} from './credits.service';
import { AdminAdjustCreditsDto } from './dto/admin-adjust-credits.dto';

@Controller('admin/credits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  /**
   * Ajuste manual de saldo pelo suporte. O autor vem do token, nunca do corpo.
   */
  @Post('adjust')
  @HttpCode(200)
  async adjust(
    @Body() dto: AdminAdjustCreditsDto,
    @Request() req: { user: { id: string } },
  ): Promise<AdminAdjustResult> {
    try {
      return await this.creditsService.adminAdjust({
        ...dto,
        actorId: req.user.id,
      });
    } catch (error) {
      if (error instanceof NegativeBalanceError) {
        throw new UnprocessableEntityException(error.message);
      }
      if (error instanceof IdempotencyKeyConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
