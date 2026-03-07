import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { TokenRevocationService } from '../token-revocation/token-revocation.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private tokenRevocationService: TokenRevocationService,
    private mailService: MailService,
    private prisma: PrismaService,
  ) { }

  /**
   * Registro de usuário
   * Usuários são criados ATIVOS e podem fazer login imediatamente
   */
  async register(
    email: string,
    name: string,
    password: string,
    role?: UserRole,
  ) {
    // SEGURANÇA: Bloquear criação de ADMIN via registro público
    if (role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Não é permitido criar usuários ADMIN via registro',
      );
    }

    // Criar usuário ATIVO por padrão
    const user = await this.usersService.create(
      email,
      name,
      password,
      role || UserRole.USER,
      true, // isActive = true - usuário pode fazer login imediatamente
    );

    // Gerar tokens para login automático
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      ...tokens,
      message: 'Usuário criado com sucesso. Você já pode fazer login.',
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // CRÍTICO: Verificar se usuário está ativo
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Usuário inativo. Entre em contato com o administrador.',
      );
    }

    const isPasswordValid = await this.usersService.validatePassword(
      user,
      password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      ...tokens,
    };
  }

  async validateUser(userId: string) {
    const user = await this.usersService.findById(userId);

    // Verificar se usuário ainda está ativo
    if (!user.isActive) {
      throw new UnauthorizedException('Usuário foi desativado');
    }

    return user;
  }

  private async generateTokens(userId: string, email: string, role: UserRole) {
    const payload = { sub: userId, email, role };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const isRevoked =
        await this.tokenRevocationService.isTokenRevoked(refreshToken);
      if (isRevoked) {
        throw new UnauthorizedException('Token revogado');
      }

      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      });

      // Verificar se usuário ainda está ativo
      const user = await this.usersService.findById(payload.sub);
      if (!user.isActive) {
        throw new UnauthorizedException('Usuário foi desativado');
      }

      return this.generateTokens(payload.sub, payload.email, payload.role);
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  async logout(userId: string, refreshToken: string) {
    try {
      const decoded = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key',
      });

      const expiresAt = new Date(decoded.exp * 1000);

      await this.tokenRevocationService.revokeToken(
        refreshToken,
        userId,
        expiresAt,
      );

      return { message: 'Logout realizado com sucesso' };
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  async logoutAllDevices(userId: string) {
    await this.tokenRevocationService.revokeAllUserTokens(userId);
    return { message: 'Logout realizado em todos os dispositivos' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericMessage =
      'Se este email estiver cadastrado, você receberá um código de recuperação em breve.';

    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      // Resposta genérica para não revelar se o email existe
      return { message: genericMessage };
    }

    // Invalidar tokens anteriores deste email
    await this.prisma.passwordResetToken.updateMany({
      where: { email, used: false },
      data: { used: true },
    });

    // Gerar código de 6 dígitos
    const token = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.passwordResetToken.create({
      data: { token, email, expiresAt },
    });

    await this.mailService.sendPasswordResetEmail(email, token);

    return { message: genericMessage };
  }

  async resetPassword(
    email: string,
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        token,
        email,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetToken) {
      throw new UnauthorizedException(
        'Código inválido ou expirado. Solicite um novo código.',
      );
    }

    // Marcar token como usado
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    // Atualizar senha do usuário
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    await this.usersService.updateOwnProfile(user.id, { password: newPassword });

    return { message: 'Senha redefinida com sucesso. Faça login com sua nova senha.' };
  }
}
