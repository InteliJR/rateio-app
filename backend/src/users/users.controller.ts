import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { IsEmail, IsString, MinLength, IsEnum, IsBoolean, IsOptional } from 'class-validator';

// DTOs
class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;
}

class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}

class UpdateOwnProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ========================================
  // ADMIN ONLY ROUTES
  // ========================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  async create(@Body(ValidationPipe) createUserDto: CreateUserDto) {
    return this.usersService.create(
      createUserDto.email,
      createUserDto.name,
      createUserDto.password,
      createUserDto.role,
      false, // Criar inativo por padrão
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
    @Request() req: any,
  ) {
    return this.usersService.update(id, updateUserDto, req.user.id);
  }

  // ========================================
  // USER OWN PROFILE ROUTES (Authenticated)
  // ========================================

  @UseGuards(JwtAuthGuard)
  @Get('me/profile')
  getOwnProfile(@Request() req: any) {
    return this.usersService.findById(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  updateOwnProfile(
    @Request() req: any,
    @Body(ValidationPipe) updateProfileDto: UpdateOwnProfileDto,
  ) {
    return this.usersService.updateOwnProfile(req.user.id, updateProfileDto);
  }
}