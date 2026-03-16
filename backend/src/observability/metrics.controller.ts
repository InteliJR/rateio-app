import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @SkipThrottle()
  @Get()
  getMetrics() {
    return this.metrics.getSnapshot();
  }
}
