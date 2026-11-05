import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawHeader = req.headers['x-request-id'] || req.headers['X-Request-Id'];
    const incomingId = typeof rawHeader === 'string' && rawHeader.trim().length > 0
      ? rawHeader.trim()
      : undefined;

    const requestId = incomingId || randomUUID();

    (req as any).id = requestId;
    (req as any).requestId = requestId;

    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}

