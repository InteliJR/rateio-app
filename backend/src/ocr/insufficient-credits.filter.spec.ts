import 'reflect-metadata';
import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { InsufficientCreditsError } from '../credits/credits.service';
import {
  INSUFFICIENT_CREDITS_CODE,
  InsufficientCreditsFilter,
} from './insufficient-credits.filter';

describe('InsufficientCreditsFilter', () => {
  const run = (error: InsufficientCreditsError) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new InsufficientCreditsFilter().catch(error, host);

    return { status, json };
  };

  it('responde 402 com o corpo do contrato', () => {
    const { status, json } = run(new InsufficientCreditsError(0));

    expect(status).toHaveBeenCalledWith(402);
    expect(json).toHaveBeenCalledWith({
      statusCode: 402,
      code: 'INSUFFICIENT_CREDITS',
      message: 'Créditos insuficientes para iniciar a leitura.',
      available: 0,
    });
    expect(INSUFFICIENT_CREDITS_CODE).toBe('INSUFFICIENT_CREDITS');
  });

  it('não vaza nada além do saldo do próprio usuário', () => {
    const { json } = run(new InsufficientCreditsError(0));

    expect(Object.keys(json.mock.calls[0][0]).sort()).toEqual([
      'available',
      'code',
      'message',
      'statusCode',
    ]);
  });

  it('trata SOMENTE InsufficientCreditsError', () => {
    expect(
      Reflect.getMetadata(
        '__filterCatchExceptions__',
        InsufficientCreditsFilter,
      ),
    ).toEqual([InsufficientCreditsError]);
    // outras exceções não são instâncias dela
    expect(new BadRequestException() instanceof InsufficientCreditsError).toBe(
      false,
    );
    expect(new Error('x') instanceof InsufficientCreditsError).toBe(false);
  });
});
