import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnv } from '../config/read-env';
import { OAuth2Client } from 'google-auth-library';

export interface VerifiedGoogleUser {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

@Injectable()
export class GoogleTokenService {
  private readonly client = new OAuth2Client();

  constructor(@Optional() private readonly configService?: ConfigService) {}

  async verifyIdToken(idToken: string): Promise<VerifiedGoogleUser> {
    const audiences = this.getAllowedAudiences();

    if (audiences.length === 0) {
      throw new UnauthorizedException('Login Google nao configurado');
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: audiences,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Token Google invalido');
      }

      if (
        payload.iss !== 'accounts.google.com' &&
        payload.iss !== 'https://accounts.google.com'
      ) {
        throw new UnauthorizedException('Emissor do token Google invalido');
      }

      if (!payload.email || !payload.sub) {
        throw new UnauthorizedException('Token Google sem dados obrigatorios');
      }

      if (payload.email_verified !== true) {
        throw new UnauthorizedException('Email Google nao verificado');
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        picture: payload.picture,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Token Google invalido');
    }
  }

  private getAllowedAudiences(): string[] {
    const raw =
      readEnv(this.configService, 'GOOGLE_OAUTH_CLIENT_IDS') ||
      readEnv(this.configService, 'GOOGLE_OAUTH_CLIENT_ID') ||
      '';

    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
}
