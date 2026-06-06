import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { GoogleTokenService } from './google-token.service';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TokenRevocationService } from '../token-revocation/token-revocation.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByGoogleId: jest.Mock;
    findByEmail: jest.Mock;
    createGoogleUser: jest.Mock;
  };
  let googleTokenService: { verifyIdToken: jest.Mock };

  const jwtService = {
    signAsync: jest
      .fn()
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token'),
  };

  beforeEach(async () => {
    usersService = {
      findByGoogleId: jest.fn(),
      findByEmail: jest.fn(),
      createGoogleUser: jest.fn(),
    };
    googleTokenService = {
      verifyIdToken: jest.fn(),
    };
    jwtService.signAsync.mockReset();
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: TokenRevocationService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: GoogleTokenService, useValue: googleTokenService },
      ],
    })
      .compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a new user on first Google login', async () => {
    const createdUser = {
      id: 'user-id',
      email: 'new@rateio.app',
      name: 'New User',
      role: UserRole.USER,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    googleTokenService.verifyIdToken.mockResolvedValue({
      googleId: 'google-sub',
      email: createdUser.email,
      name: createdUser.name,
      picture: 'https://example.com/avatar.png',
    });
    usersService.findByGoogleId.mockResolvedValue(null);
    usersService.findByEmail.mockResolvedValue(null);
    usersService.createGoogleUser.mockResolvedValue(createdUser);

    const response = await service.loginWithGoogle('id-token');

    expect(usersService.createGoogleUser).toHaveBeenCalledWith({
      email: createdUser.email,
      name: createdUser.name,
      googleId: 'google-sub',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(response).toEqual({
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: UserRole.USER,
        createdAt: createdUser.createdAt,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('blocks automatic linking when email belongs to a local account', async () => {
    googleTokenService.verifyIdToken.mockResolvedValue({
      googleId: 'google-sub',
      email: 'local@rateio.app',
      name: 'Local User',
    });
    usersService.findByGoogleId.mockResolvedValue(null);
    usersService.findByEmail.mockResolvedValue({
      id: 'local-user-id',
      email: 'local@rateio.app',
      password: 'hashed-password',
    });

    const loginPromise = service.loginWithGoogle('id-token');

    await expect(loginPromise).rejects.toThrow(ConflictException);
    await expect(loginPromise).rejects.toThrow(
      'este email já possui conta com senha',
    );
    expect(usersService.createGoogleUser).not.toHaveBeenCalled();
  });
});
