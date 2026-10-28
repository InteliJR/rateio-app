import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import * as packageJson from '../package.json';
import { MetricsService } from './observability/metrics.service';
import { AppService } from './app.service';
import { OcrQueueService } from './ocr/ocr-queue.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly ocrQueue: OcrQueueService,
  ) {}

  @SkipThrottle()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @SkipThrottle()
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck() {
    const [dbStatus, queueStatus] = await Promise.all([
      this.checkDbConnection(),
      this.ocrQueue.getQueueSnapshot(),
    ]);

    const isDatabaseDown = dbStatus.status !== 'connected';
    const isStrict = process.env.HEALTH_STRICT_STATUS === 'true';

    return {
      status: isDatabaseDown && isStrict ? 'error' : 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      ocrQueue: queueStatus,
      version: packageJson.version,
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
