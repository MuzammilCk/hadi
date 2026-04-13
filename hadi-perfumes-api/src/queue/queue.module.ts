import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobRun } from '../modules/ops/entities/job-run.entity';
import { DeadLetterEvent } from '../modules/ops/entities/dead-letter-event.entity';

// Processors wrap existing jobs — they never rewrite business logic
import { CommissionOutboxProcessor } from './processors/commission-outbox.processor';
import { CommissionReleaseProcessor } from './processors/commission-release.processor';
import { ReservationExpiryProcessor } from './processors/reservation-expiry.processor';
import { DisputeEscalationProcessor } from './processors/dispute-escalation.processor';
import { FraudAggregationProcessor } from './processors/fraud-aggregation.processor';
import { HoldPropagationProcessor } from './processors/hold-propagation.processor';
import { ReturnEligibilityProcessor } from './processors/return-eligibility.processor';
import { JobSchedulerService } from './schedulers/job-scheduler.service';

// Import modules that own the job services — required for NestJS DI resolution.
// QueueModule processors inject job services (CommissionReleaseJob, ReservationExpiryJob, etc.)
// which are only accessible if their owning modules are imported here.
import { CommissionModule } from '../modules/commission/commission.module';
import { InventoryModule } from '../modules/inventory/inventory.module';
import { TrustModule } from '../modules/trust/trust.module';

// Re-export so existing imports of QUEUE_NAMES from this file still work
export { QUEUE_NAMES } from './queue.constants';
import { QUEUE_NAMES } from './queue.constants';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: process.env.REDIS_URL || 'redis://localhost:6379',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.COMMISSION_OUTBOX },
      { name: QUEUE_NAMES.COMMISSION_RELEASE },
      { name: QUEUE_NAMES.RESERVATION_EXPIRY },
      { name: QUEUE_NAMES.DISPUTE_ESCALATION },
      { name: QUEUE_NAMES.FRAUD_AGGREGATION },
      { name: QUEUE_NAMES.HOLD_PROPAGATION },
      { name: QUEUE_NAMES.RETURN_ELIGIBILITY },
    ),
    TypeOrmModule.forFeature([JobRun, DeadLetterEvent]),
    // These modules export the job services that processors inject.
    // NestJS requires direct imports — parent AppModule graph does NOT
    // transitively provide providers (modules are not @Global).
    CommissionModule,
    InventoryModule,
    TrustModule,
  ],
  providers: [
    CommissionOutboxProcessor,
    CommissionReleaseProcessor,
    ReservationExpiryProcessor,
    DisputeEscalationProcessor,
    FraudAggregationProcessor,
    HoldPropagationProcessor,
    ReturnEligibilityProcessor,
    JobSchedulerService,
  ],
  exports: [BullModule],
})
export class QueueModule {}
