import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { JobRun } from './entities/job-run.entity';
import { DeadLetterEvent } from './entities/dead-letter-event.entity';
import { SecurityEvent } from './entities/security-event.entity';
import { TrustAuditLog } from '../trust/audit/entities/trust-audit-log.entity';
import { MetricsService } from './services/metrics.service';
import { SecurityEventService } from './services/security-event.service';
import { HealthController } from './controllers/health.controller';
import { AuthModule } from '../auth/auth.module';

// OpsService and AdminOpsController require BullMQ queues — only load outside test env
const conditionalProviders =
  process.env.NODE_ENV !== 'test'
    ? [require('./services/ops.service').OpsService]
    : [];

const conditionalControllers =
  process.env.NODE_ENV !== 'test'
    ? [require('./controllers/admin-ops.controller').AdminOpsController]
    : [];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JobRun,
      DeadLetterEvent,
      SecurityEvent,
      TrustAuditLog,
    ]),
    TerminusModule,
    AuthModule,
  ],
  providers: [MetricsService, SecurityEventService, ...conditionalProviders],
  controllers: [HealthController, ...conditionalControllers],
  exports: [MetricsService, SecurityEventService],
})
export class OpsModule {}
