
## Phase 7: Trust & Safety
- **Returns & Disputes**: Built `ReturnService` and `DisputeService` to handle request creation, evidence submission, and deterministic state transitions.
- **Fraud & Moderation**: Implemented `FraudSignalService` and `ModerationService` for risk scoring and queueing.
- **Holds & Idempotency**: Created `HoldService`, integrated hold verification before executing payouts and commission releases.
- **Audit & Jobs**: Setup strict `TrustAuditService` logging. Implemented background jobs (`ReturnEligibilityJob`, `DisputeEscalationJob`, `FraudAggregationJob`, `HoldPropagationJob`).
- **Tests**: Added full Integration and E2E test suites inside `test/integration/trust/` and `test/e2e/`, fixing constraint and idempotency validation issues. 100% pass rate achieved for Trust Layer.

## Phase 8: Observability · Security Hardening · Resilience
- **Packages**: `@nestjs/bull`, `bullmq`, `@nestjs/terminus`, `@nestjs/schedule`, `nestjs-pino`, `pino-pretty`, `helmet`, `compression`, `@nestjs/config`, `joi`, `prom-client`.
- **Migration**: `Phase8OpsInit` — `job_runs`, `dead_letter_events`, `security_events` tables + 7 composite/partial indexes.
- **Entities**: `JobRun`, `DeadLetterEvent`, `SecurityEvent` (dual-DB compatible).
- **Config**: Boot-time Joi validation for all critical env vars.
- **Middleware/Interceptors**: `CorrelationIdMiddleware`, `LoggingInterceptor`, log redaction utility.
- **BullMQ**: `QueueModule` + 6 processor wrappers + `JobSchedulerService` (cron-based enqueuing).
- **Ops Module**: `HealthController` (`/health`, `/ready`, `/metrics`), `AdminOpsController` (`/admin/ops/*`), `SecurityEventService`, `MetricsService`.
- **Hardening**: `helmet`, `compression` in `main.ts`. Security event logging in `AdminGuard` (fire-and-forget, @Optional injection).
- **Tests**: 47 new tests across 6 suites. 366 total tests, 53 suites, 0 failures.

## 2026-04-11 (Phase 8 Startup Fix)

### Changed
- `src/modules/trust/trust.module.ts`: Added ReturnEligibilityJob, DisputeEscalationJob,
  FraudAggregationJob, HoldPropagationJob to exports. QueueModule processors require these.
- `src/modules/ops/ops.module.ts`: Removed dynamic require() for OpsService and
  AdminOpsController. Added static imports. Added BullModule.forRootAsync() and
  BullModule.registerQueue() so OpsService can inject BullMQ queue tokens.
- `src/modules/admin/guards/admin.guard.ts`: Replaced @Inject('SecurityEventService')
  string token with direct class injection + @Optional(). String token never resolved.
- `src/main.ts`: Added validateEnv() call at top of bootstrap() (skipped in test env).
- `src/config/app.config.ts`: Changed REDIS_URL from .required() to
  .default('redis://localhost:6379') for graceful local dev without Redis.
- `src/queue/queue.constants.ts`: [NEW] Extracted QUEUE_NAMES to a standalone constants
  file to break circular import between queue.module.ts and processor files.
- `src/queue/processors/*.processor.ts`: Updated all 6 processors to import QUEUE_NAMES
  from queue.constants instead of queue.module (fixes circular import crash).

### Why
- Phase 8 wiring errors prevented the application from starting. All 6 issues were
  NestJS DI/module registration problems, not business logic errors. An additional
  circular CJS import issue (QUEUE_NAMES undefined at decorator evaluation time) was
  discovered and fixed during verification.

### Impact
- Backend boots cleanly. No business logic changed.
