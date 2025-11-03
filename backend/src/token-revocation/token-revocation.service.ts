import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TokenRevocationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Adiciona um token à blacklist
   */
  async revokeToken(token: string, userId: string, expiresAt: Date) {
    await this.prisma.revokedToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Verifica se um token está revogado
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    const revokedToken = await this.prisma.revokedToken.findUnique({
      where: { token },
    });

    return !!revokedToken;
  }

  /**
   * Remove todos os tokens de um usuário (logout de todos os dispositivos)
   */
  async revokeAllUserTokens(userId: string) {
    await this.prisma.revokedToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * Limpa tokens expirados (pode ser chamado manualmente ou via cron externo)
   */
  async cleanupExpiredTokens() {
    const now = new Date();
    const result = await this.prisma.revokedToken.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    console.log(`🧹 Limpeza:${result.count}tokens expirados removidos`);
    return result;
  }

  /**
   * Força limpeza manual
   */
  async forceCleanup() {
    return this.cleanupExpiredTokens();
  }
}
