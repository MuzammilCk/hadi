import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { validateEnv } from './config/app.config';
import helmet from 'helmet';
import compression from 'compression';

async function bootstrap() {
  // Phase 8: fail fast on missing critical config BEFORE any module is initialized.
  // In test env, skip validation — Jest sets NODE_ENV=test and config is mocked.
  if (process.env.NODE_ENV !== 'test') {
    validateEnv(process.env as Record<string, unknown>);
  }

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // Phase 8: security headers
  app.use(helmet());

  // Phase 8: compression
  app.use(compression());

  // Phase 8: correlation ID on every request
  const correlationMiddleware = new CorrelationIdMiddleware();
  app.use(correlationMiddleware.use.bind(correlationMiddleware));

  // Existing: DTO validation (unchanged)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Phase 8: request/response logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Existing: CORS (unchanged)
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || ['http://localhost:5173'],
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  Logger.log(`Application listening on port ${process.env.PORT ?? 3000}`);
}

// ── Process-level resilience ──────────────────────────────────────────────────
// Transient failures (DNS blips, brief Supabase outages, connection pool resets)
// must NEVER crash the process. Log them loudly, but stay alive so the next
// request can succeed once connectivity returns.
const processLogger = new Logger('Process');

process.on('unhandledRejection', (reason: any) => {
  processLogger.error(
    `Unhandled promise rejection — ${reason?.message || reason}`,
    reason?.stack,
  );
  // Do NOT call process.exit(). The HTTP server stays alive.
});

process.on('uncaughtException', (error: Error) => {
  processLogger.error(
    `Uncaught exception — ${error.message}`,
    error.stack,
  );
  // For truly fatal errors (out-of-memory, corrupted heap), Node will still
  // crash on its own. For network/DNS errors, we survive.
});

bootstrap().catch((err) => {
  processLogger.error(`Bootstrap failed: ${err.message}`, err.stack);
  process.exit(1);
});
