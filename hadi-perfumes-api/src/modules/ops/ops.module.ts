import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bull';
import { JobRun } from './entities/job-run.entity';
import { DeadLetterEvent } from './entities/dead-letter-event.entity';
import { SecurityEvent } from './entities/security-event.entity';
import { TrustAuditLog } from '../trust/audit/entities/trust-audit-log.entity';
import { MetricsService } from './services/metrics.service';
import { SecurityEventService } from './services/security-event.service';
import { OpsService } from './services/ops.service';
import { HealthController } from './controllers/health.controller';
import { AdminOpsController } from './controllers/admin-ops.controller';
import { AuthModule } from '../auth/auth.module';

// Queue names must match QueueModule exactly
const QUEUE_NAMES = [
  'commission-release',
  'reservation-expiry',
  'dispute-escalation',
  'fraud-aggregation',
  'hold-propagation',
  'return-eligibility',
];

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
    // Register queues so OpsService can inject them for replay functionality.
    // These are the same queues defined in QueueModule — BullMQ deduplicates connections.
    // Only register when Redis is available (non-test environments).
    ...(process.env.NODE_ENV !== 'test'
      ? [
          BullModule.forRootAsync({
            useFactory: () => ({
              redis: process.env.REDIS_URL || 'redis://localhost:6379',
            }),
          }),
          BullModule.registerQueue(
            ...QUEUE_NAMES.map(name => ({ name })),
          ),
        ]
      : []),
  ],
  providers: [
    MetricsService,
    SecurityEventService,
    // OpsService only available when BullMQ queues are registered
    ...(process.env.NODE_ENV !== 'test' ? [OpsService] : []),
  ],
  controllers: [
    HealthController,
    ...(process.env.NODE_ENV !== 'test' ? [AdminOpsController] : []),
  ],
  exports: [MetricsService, SecurityEventService],
})
export class OpsModule {}
