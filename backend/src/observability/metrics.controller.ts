import { Controller, Get, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';
import { MetricsAuthGuard } from '../common/guards/metrics-auth.guard';

@Controller('metrics')
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @SkipThrottle()
  @Get()
  getMetrics() {
    return this.metrics.getSnapshot();
  }
}
