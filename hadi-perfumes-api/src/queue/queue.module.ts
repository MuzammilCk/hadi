import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobRun } from '../modules/ops/entities/job-run.entity';
import { DeadLetterEvent } from '../modules/ops/entities/dead-letter-event.entity';

// Processors wrap existing jobs — they never rewrite business logic
import { CommissionReleaseProcessor } from './processors/commission-release.processor';
import { ReservationExpiryProcessor } from './processors/reservation-expiry.processor';
import { DisputeEscalationProcessor } from './processors/dispute-escalation.processor';
import { FraudAggregationProcessor } from './processors/fraud-aggregation.processor';
import { HoldPropagationProcessor } from './processors/hold-propagation.processor';
import { ReturnEligibilityProcessor } from './processors/return-eligibility.processor';
import { JobSchedulerService } from './schedulers/job-scheduler.service';

// Import modules that own the job services
import { CommissionModule } from '../modules/commission/commission.module';
import { InventoryModule } from '../modules/inventory/inventory.module';
import { TrustModule } from '../modules/trust/trust.module';

export const QUEUE_NAMES = {
  COMMISSION_RELEASE: 'commission-release',
  RESERVATION_EXPIRY: 'reservation-expiry',
  DISPUTE_ESCALATION: 'dispute-escalation',
  FRAUD_AGGREGATION: 'fraud-aggregation',
  HOLD_PROPAGATION: 'hold-propagation',
  RETURN_ELIGIBILITY: 'return-eligibility',
};

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
      { name: QUEUE_NAMES.COMMISSION_RELEASE },
      { name: QUEUE_NAMES.RESERVATION_EXPIRY },
      { name: QUEUE_NAMES.DISPUTE_ESCALATION },
      { name: QUEUE_NAMES.FRAUD_AGGREGATION },
      { name: QUEUE_NAMES.HOLD_PROPAGATION },
      { name: QUEUE_NAMES.RETURN_ELIGIBILITY },
    ),
    TypeOrmModule.forFeature([JobRun, DeadLetterEvent]),
    CommissionModule,
    InventoryModule,
    TrustModule,
  ],
  providers: [
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
