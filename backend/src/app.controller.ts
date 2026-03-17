import { Controller, Get, HttpCode, HttpStatus, NotFoundException, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
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

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      ocrQueue: queueStatus,
      metrics: this.metrics.getSnapshot(),
      version: packageJson.version,
    };
  }

  @SkipThrottle()
  @Get('docs')
  serveDocs(@Res() res: Response) {
    const filePath = path.join(
      process.cwd(),
      'dist',
      'assets',
      'api_documentation.html',
    );

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Documentation file not found');
    }

    return res.sendFile(filePath);
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
    } catch (error) {
      let errorMessage = 'Failed to connect to database.';

      if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        status: 'disconnected',
        responseTime: -1,
        error: errorMessage,
      };
    }
  }
}
