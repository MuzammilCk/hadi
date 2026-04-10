import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Accept from upstream if present; generate if absent. Never trust for security.
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER.toLowerCase()] as string) ??
      randomUUID();
    (req as any)['correlationId'] = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
