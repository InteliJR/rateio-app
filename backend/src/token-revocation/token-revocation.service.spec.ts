import { Test, TestingModule } from '@nestjs/testing';
import { TokenRevocationService } from './token-revocation.service';

describe('TokenRevocationService', () => {
  let service: TokenRevocationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenRevocationService],
    }).compile();

    service = module.get<TokenRevocationService>(TokenRevocationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
