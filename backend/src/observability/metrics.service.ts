import { Injectable } from '@nestjs/common';

type HttpMetric = {
  count: number;
  errors4xx: number;
  errors5xx: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastStatusCode: number;
  lastDurationMs: number;
  lastSeenAt: string;
};

type OcrMetric = {
  queued: number;
  started: number;
  completed: number;
  failed: number;
  retried: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
  lastError?: string;
  lastProcessedAt?: string;
};

@Injectable()
export class MetricsService {
  private readonly startedAt = new Date();
  private readonly httpMetrics = new Map<string, HttpMetric>();
  private readonly ocrMetrics: OcrMetric = {
    queued: 0,
    started: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    lastDurationMs: 0,
  };

  recordHttpRequest(routeKey: string, statusCode: number, durationMs: number) {
    const current = this.httpMetrics.get(routeKey) ?? {
      count: 0,
      errors4xx: 0,
      errors5xx: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      lastStatusCode: statusCode,
      lastDurationMs: durationMs,
      lastSeenAt: new Date().toISOString(),
    };

    current.count += 1;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    current.lastStatusCode = statusCode;
    current.lastDurationMs = durationMs;
    current.lastSeenAt = new Date().toISOString();

    if (statusCode >= 400 && statusCode < 500) {
      current.errors4xx += 1;
    } else if (statusCode >= 500) {
      current.errors5xx += 1;
    }

    this.httpMetrics.set(routeKey, current);
  }

  recordOcrQueued() {
    this.ocrMetrics.queued += 1;
  }

  recordOcrStarted() {
    this.ocrMetrics.started += 1;
  }

  recordOcrRetry() {
    this.ocrMetrics.retried += 1;
  }

  recordOcrCompleted(durationMs: number) {
    this.ocrMetrics.completed += 1;
    this.ocrMetrics.totalDurationMs += durationMs;
    this.ocrMetrics.maxDurationMs = Math.max(this.ocrMetrics.maxDurationMs, durationMs);
    this.ocrMetrics.lastDurationMs = durationMs;
    this.ocrMetrics.lastProcessedAt = new Date().toISOString();
    this.ocrMetrics.lastError = undefined;
  }

  recordOcrFailed(durationMs: number, errorMessage: string) {
    this.ocrMetrics.failed += 1;
    this.ocrMetrics.totalDurationMs += durationMs;
    this.ocrMetrics.maxDurationMs = Math.max(this.ocrMetrics.maxDurationMs, durationMs);
    this.ocrMetrics.lastDurationMs = durationMs;
    this.ocrMetrics.lastProcessedAt = new Date().toISOString();
    this.ocrMetrics.lastError = errorMessage;
  }

  getSnapshot() {
    const http = Array.from(this.httpMetrics.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([route, metric]) => ({
        route,
        count: metric.count,
        errors4xx: metric.errors4xx,
        errors5xx: metric.errors5xx,
        avgDurationMs:
          metric.count > 0 ? Math.round(metric.totalDurationMs / metric.count) : 0,
        maxDurationMs: Math.round(metric.maxDurationMs),
        lastStatusCode: metric.lastStatusCode,
        lastDurationMs: Math.round(metric.lastDurationMs),
        lastSeenAt: metric.lastSeenAt,
      }));

    const ocrAverage =
      this.ocrMetrics.completed + this.ocrMetrics.failed > 0
        ? Math.round(
            this.ocrMetrics.totalDurationMs /
              (this.ocrMetrics.completed + this.ocrMetrics.failed),
          )
        : 0;

    return {
      startedAt: this.startedAt.toISOString(),
      uptimeSeconds: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      http,
      ocr: {
        ...this.ocrMetrics,
        avgDurationMs: ocrAverage,
      },
    };
  }
}
