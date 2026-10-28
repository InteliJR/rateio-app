import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class MetricsAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const metricsToken = this.configService.get<string>('METRICS_TOKEN');

    // Se METRICS_TOKEN não estiver configurado, a rota responde 404 (desabilitada por segurança)
    if (!metricsToken) {
      throw new NotFoundException('Cannot GET /metrics');
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Metrics token não fornecido');
    }

    const bearerPrefix = 'Bearer ';
    if (!authHeader.startsWith(bearerPrefix)) {
      throw new UnauthorizedException('Formato de autorização inválido');
    }

    const token = authHeader.slice(bearerPrefix.length).trim();

    // Comparação em tempo constante (timing safe) para mitigar timing attacks
    const expectedBuffer = Buffer.from(metricsToken);
    const actualBuffer = Buffer.from(token);

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new UnauthorizedException('Metrics token inválido');
    }

    return true;
  }
}
