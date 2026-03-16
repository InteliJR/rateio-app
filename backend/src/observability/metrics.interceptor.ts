import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startedAt = Date.now();
    const routePath =
      request.route?.path ?? request.originalUrl ?? request.url ?? 'unknown';
    const routeKey = `${request.method} ${routePath}`;

    return next.handle().pipe(
      tap({
        next: () => {
          this.metrics.recordHttpRequest(
            routeKey,
            response.statusCode,
            Date.now() - startedAt,
          );
        },
        error: (error) => {
          const statusCode =
            error?.status ??
            error?.statusCode ??
            response.statusCode ??
            500;

          this.metrics.recordHttpRequest(
            routeKey,
            statusCode,
            Date.now() - startedAt,
          );
        },
      }),
    );
  }
}
