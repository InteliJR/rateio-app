import { ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsAuthGuard } from './metrics-auth.guard';

describe('MetricsAuthGuard', () => {
  let guard: MetricsAuthGuard;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    guard = new MetricsAuthGuard(configService);
  });

  function createMockContext(authHeader?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authHeader ? { authorization: authHeader } : {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('deve lançar NotFoundException (404) se METRICS_TOKEN não estiver configurado', () => {
    configService.get.mockReturnValue(undefined);
    const context = createMockContext('Bearer token123');

    expect(() => guard.canActivate(context)).toThrow(NotFoundException);
  });

  it('deve lançar UnauthorizedException se cabeçalho Authorization não for fornecido', () => {
    configService.get.mockReturnValue('segredo-forte-123');
    const context = createMockContext();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('deve lançar UnauthorizedException se formato não for Bearer', () => {
    configService.get.mockReturnValue('segredo-forte-123');
    const context = createMockContext('Basic dXNlcjpwYXNz');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('deve lançar UnauthorizedException se token for incorreto', () => {
    configService.get.mockReturnValue('segredo-forte-123');
    const context = createMockContext('Bearer token-errado');

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('deve permitir acesso se token estiver correto', () => {
    configService.get.mockReturnValue('segredo-forte-123');
    const context = createMockContext('Bearer segredo-forte-123');

    expect(guard.canActivate(context)).toBe(true);
  });
});
