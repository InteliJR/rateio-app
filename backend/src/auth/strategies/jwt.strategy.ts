import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { TokenRevocationService } from '../../token-revocation/token-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
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
    // Extrai o token do header
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

    // Verificar se token existe
    if (!token) {
      throw new UnauthorizedException('Token não fornecido');
    }

    // Verifica se está na blacklist
    const isRevoked = await this.tokenRevocationService.isTokenRevoked(token);
    if (isRevoked) {
      throw new UnauthorizedException('Token revogado');
    }

    const user = await this.authService.validateUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
