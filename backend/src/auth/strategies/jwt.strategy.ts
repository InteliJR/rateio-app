import { Injectable, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { TokenRevocationService } from '../../token-revocation/token-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
    private tokenRevocationService: TokenRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      passReqToCallback: true,
    });
  }

  async validate(request: any, payload: any) {
    try {
      // Extrai o token do header
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

      // Verificar se token existe
      if (!token) {
        throw new UnauthorizedException('Token não fornecido');
      }

      // Verifica se está na blacklist
      // Se houver erro na verificação (ex: banco desconectado), permite continuar
      // para não bloquear autenticação em caso de problemas temporários
      try {
        const isRevoked = await this.tokenRevocationService.isTokenRevoked(token);
        if (isRevoked) {
          throw new UnauthorizedException('Token revogado');
        }
      } catch (error) {
        // Se for erro de token revogado, re-lança
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        // Se for outro erro (ex: banco desconectado), loga mas continua
        console.warn('[JWT Strategy] Erro ao verificar token revogado:', error);
      }

      const user = await this.authService.validateUser(payload.sub);

      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado');
      }

      return user;
    } catch (error) {
      // Re-lança UnauthorizedException
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Outros erros são tratados como não autorizados
      console.error('[JWT Strategy] Erro na validação:', error);
      throw new UnauthorizedException('Erro ao validar token');
    }
  }
}
