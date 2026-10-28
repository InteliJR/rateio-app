import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @SkipThrottle()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @SkipThrottle()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(@Res({ passthrough: true }) res: Response) {
    const dbStatus = await this.checkDbConnection();
    const isDatabaseDown = dbStatus.status !== 'connected';
    const isStrict = process.env.HEALTH_STRICT_STATUS === 'true';

    if (isDatabaseDown && isStrict) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isDatabaseDown && isStrict ? 'error' : 'ok',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus.status,
      },
    };
  }

  private async checkDbConnection() {
    const startTime = process.hrtime.bigint();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1_000_000;

      return {
        status: 'connected',
        responseTime: Math.round(responseTime),
      };
    } catch {
      // Não vaza detalhes de conexão ou mensagens cruas de erro do driver
      return {
        status: 'disconnected',
        responseTime: -1,
      };
    }
  }
}
