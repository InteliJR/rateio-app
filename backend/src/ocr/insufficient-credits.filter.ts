import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { InsufficientCreditsError } from '../credits/credits.service';

export const INSUFFICIENT_CREDITS_CODE = 'INSUFFICIENT_CREDITS';

/**
 * Converte SOMENTE InsufficientCreditsError em 402. O app reconhece o status
 * 402; o `code` é o contrato estável para o corpo. Mensagem fixa: nada do
 * usuário além do saldo disponível dele mesmo.
 */
@Catch(InsufficientCreditsError)
export class InsufficientCreditsFilter implements ExceptionFilter {
  catch(exception: InsufficientCreditsError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();

    response.status(HttpStatus.PAYMENT_REQUIRED).json({
      statusCode: HttpStatus.PAYMENT_REQUIRED,
      code: INSUFFICIENT_CREDITS_CODE,
      message: 'Créditos insuficientes para iniciar a leitura.',
      available: exception.available,
    });
  }
}
