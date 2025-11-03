import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
    role: UserRole = UserRole.COMERCIAL,
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
        createdAt: true,
      },
    });

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
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
      throw new BadRequestException('Você não pode desativar sua própria conta');
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

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
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
      },
    });
  }

  async validatePassword(user: any, password: string): Promise<boolean> {
    const passwordWithPepper = password + this.pepper;
    return argon2.verify(user.password, passwordWithPepper);
  }

  async createFirstAdmin(email: string, password: string, name: string = 'Admin') {
    const existingAdmin = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
    });

    if (existingAdmin) {
      throw new ConflictException('Já existe um administrador no sistema');
    }

    return this.create(email, name, password, UserRole.ADMIN, true);
  }
}