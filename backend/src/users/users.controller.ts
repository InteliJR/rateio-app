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
  UseInterceptors,
  UploadedFile,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { StorageService } from '../storage/storage.service';
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
  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

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

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: require('multer').diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, callback) => {
          const userId = (req as any).user.id;
          const ext = file.originalname.split('.').pop();
          const filename = `${userId}-${Date.now()}.${ext}`;
          callback(null, filename);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException('Apenas imagens são permitidas'),
            false,
          );
        }
        callback(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo foi enviado');
    }

    return this.usersService.updateAvatarUrl(req.user.id, file.filename);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/avatar')
  async removeAvatar(@Request() req: any) {
    const user = await this.usersService.findById(req.user.id) as any;
    
    if (user?.avatarUrl) {
      const fileName = user.avatarUrl.split('/').pop();
      if (fileName) {
        await this.storageService.deleteLocalFile(fileName);
      }
    }

    return this.usersService.removeAvatar(req.user.id);
  }
}