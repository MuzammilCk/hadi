import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError } from 'rxjs';
import { redactSensitive } from '../utils/log-redact.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const { method, path } = req;
    const correlationId = req['correlationId'] || 'unknown';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.logger.log({ correlationId, method, path, ms, status: 'ok' });
      }),
      catchError((err) => {
        const ms = Date.now() - start;
        this.logger.error(
          redactSensitive({
            correlationId,
            method,
            path,
            ms,
            error: err?.message,
          }),
        );
        throw err;
      }),
    );
  }
}
