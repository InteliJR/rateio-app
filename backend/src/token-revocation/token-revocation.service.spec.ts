import { Test, TestingModule } from '@nestjs/testing';
import { TokenRevocationService } from './token-revocation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TokenRevocationService', () => {
  let service: TokenRevocationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenRevocationService,
        {
          provide: PrismaService,
          useValue: {
            revokedToken: {
              create: jest.fn(),
              findUnique: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<TokenRevocationService>(TokenRevocationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
