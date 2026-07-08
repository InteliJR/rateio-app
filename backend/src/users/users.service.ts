import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  private readonly pepper = process.env.PASSWORD_PEPPER || '';

  // Método auxiliar centralizado para hash de senha
  private async hashPassword(password: string): Promise<string> {
    const passwordWithPepper = password + this.pepper;
    return argon2.hash(passwordWithPepper, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async create(
    email: string,
    name: string,
    password: string,
    role: UserRole = UserRole.USER, // ✅ MUDANÇA AQUI
    isActive: boolean = false,
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    const hashedPassword = await this.hashPassword(password);

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role,
        isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return this.withFreshAvatarUrl(user);
  }

  async createGoogleUser(data: {
    email: string;
    name: string;
    googleId: string;
    avatarUrl?: string;
  }) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException('Email ja cadastrado');
    }

    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: null,
        role: UserRole.USER,
        isActive: true,
        avatarUrl: data.avatarUrl,
        googleAvatarUrl: data.avatarUrl,
        googleId: data.googleId,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        googleId: true,
        googleAvatarUrl: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
  }

  private async withFreshAvatarUrl<T extends { avatarUrl?: string | null }>(
    user: T,
  ): Promise<T> {
    const key = this.storageService.extractStorageKeyFromUrl(user.avatarUrl);

    if (!key?.startsWith('avatars/')) {
      return user;
    }

    try {
      return {
        ...user,
        avatarUrl: await this.storageService.getSignedUrl(key),
      };
    } catch {
      return user;
    }
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({
      where: { googleId },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.withFreshAvatarUrl(user);
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        avatarUrl: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      role?: UserRole;
      isActive?: boolean;
      password?: string;
    },
    requestingUserId?: string,
  ) {
    const user = await this.findById(id);

    // Validação: Admin não pode desativar a si mesmo
    if (requestingUserId === id && data.isActive === false) {
      throw new BadRequestException(
        'Você não pode desativar sua própria conta',
      );
    }

    // Validação: Admin não pode mudar a própria role
    if (requestingUserId === id && data.role && data.role !== user.role) {
      throw new BadRequestException('Você não pode alterar sua própria role');
    }

    // Validação: Não pode desativar o último admin ativo
    if (user.role === UserRole.ADMIN && data.isActive === false) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          isActive: true,
          id: { not: id },
        },
      });

      if (activeAdminCount === 0) {
        throw new BadRequestException(
          'Não é possível desativar o último administrador ativo do sistema',
        );
      }
    }

    // ✅ CORREÇÃO: usar método centralizado de hash
    let hashedPassword: string | undefined;
    if (data.password) {
      hashedPassword = await this.hashPassword(data.password);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        ...(hashedPassword && { password: hashedPassword }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        avatarUrl: true,
      },
    });
  }

  async updateOwnProfile(
    userId: string,
    data: {
      name?: string;
      password?: string;
    },
  ) {
    await this.findById(userId); // Validar existência

    // ✅ CORREÇÃO: usar método centralizado de hash
    let hashedPassword: string | undefined;
    if (data.password) {
      hashedPassword = await this.hashPassword(data.password);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        ...(hashedPassword && { password: hashedPassword }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.withFreshAvatarUrl(user);
  }

  async deleteOwnAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        bills: {
          select: {
            imageKey: true,
            imageUrl: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role === UserRole.ADMIN && user.isActive) {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          isActive: true,
          id: { not: userId },
        },
      });

      if (activeAdminCount === 0) {
        throw new BadRequestException(
          'Não é possível excluir o último administrador ativo do sistema',
        );
      }
    }

    const storageKeys = this.collectOwnedStorageKeys(user);

    await Promise.all(
      Array.from(storageKeys).map((key) =>
        this.storageService.deleteFile(key).catch(() => undefined),
      ),
    );

    await this.prisma.passwordResetToken.deleteMany({
      where: { email: user.email },
    });

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return { message: 'Conta excluída com sucesso' };
  }

  private collectOwnedStorageKeys(user: {
    avatarUrl: string | null;
    bills: Array<{ imageKey: string | null; imageUrl: string | null }>;
  }) {
    const keys = new Set<string>();
    const avatarKey = this.storageService.extractStorageKeyFromUrl(user.avatarUrl);

    if (avatarKey?.startsWith('avatars/')) {
      keys.add(avatarKey);
    }

    for (const bill of user.bills) {
      const imageKey =
        bill.imageKey ||
        this.storageService.extractStorageKeyFromUrl(bill.imageUrl);

      if (imageKey?.startsWith('bills/')) {
        keys.add(imageKey);
      }
    }

    return keys;
  }

  async validatePassword(user: any, password: string): Promise<boolean> {
    if (!user?.password) {
      return false;
    }

    const passwordWithPepper = password + this.pepper;
    return argon2.verify(user.password, passwordWithPepper);
  }

  async createFirstAdmin(
    email: string,
    password: string,
    name: string = 'Admin',
  ) {
    const existingAdmin = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
    });

    if (existingAdmin) {
      throw new ConflictException('Já existe um administrador no sistema');
    }

    return this.create(email, name, password, UserRole.ADMIN, true);
  }

  async updateAvatarUrl(userId: string, avatarUrl: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.deletePreviousAvatar(user.avatarUrl, avatarUrl);

    return this.withFreshAvatarUrl(updatedUser);
  }

  private async deletePreviousAvatar(
    previousAvatarUrl: string | null,
    nextAvatarUrl: string | null,
  ) {
    if (!previousAvatarUrl || previousAvatarUrl === nextAvatarUrl) {
      return;
    }

    const previousKey = this.storageService.extractStorageKeyFromUrl(previousAvatarUrl);
    const nextKey = this.storageService.extractStorageKeyFromUrl(nextAvatarUrl);

    if (
      previousKey &&
      previousKey !== nextKey &&
      previousKey.startsWith('avatars/')
    ) {
      await this.storageService.deleteFile(previousKey);
    }
  }

  /**
   * Remove avatar do usuário
   */
  async removeAvatar(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }
}
