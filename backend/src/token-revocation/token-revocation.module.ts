import { Module } from '@nestjs/common';
import { TokenRevocationService } from './token-revocation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TokenRevocationService],
  exports: [TokenRevocationService],
})
export class TokenRevocationModule {}
