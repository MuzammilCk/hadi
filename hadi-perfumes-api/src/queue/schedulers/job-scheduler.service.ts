import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import * as Bull from 'bull';

@Injectable()
export class JobSchedulerService {
  private readonly logger = new Logger(JobSchedulerService.name);

  constructor(
    @InjectQueue('commission-release')
    private commissionReleaseQueue: Bull.Queue,
    @InjectQueue('reservation-expiry')
    private reservationExpiryQueue: Bull.Queue,
    @InjectQueue('dispute-escalation')
    private disputeEscalationQueue: Bull.Queue,
    @InjectQueue('fraud-aggregation')
    private fraudAggregationQueue: Bull.Queue,
    @InjectQueue('hold-propagation')
    private holdPropagationQueue: Bull.Queue,
    @InjectQueue('return-eligibility')
    private returnEligibilityQueue: Bull.Queue,
  ) {}

  // Every 10 minutes — release matured commission events
  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduleCommissionRelease(): Promise<void> {
    await this.commissionReleaseQueue.add('run', {}, {
      jobId: `commission-release-${Date.now()}`,
    });
  }

  // Every 5 minutes — expire stale reservations
  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduleReservationExpiry(): Promise<void> {
    await this.reservationExpiryQueue.add('run', {}, {
      jobId: `reservation-expiry-${Date.now()}`,
    });
  }

  // Every hour — auto-escalate overdue disputes
  @Cron(CronExpression.EVERY_HOUR)
  async scheduleDisputeEscalation(): Promise<void> {
    await this.disputeEscalationQueue.add('run', {});
  }

  // Every 2 hours — recalculate fraud risk scores
  @Cron('0 */2 * * *')
  async scheduleFraudAggregation(): Promise<void> {
    await this.fraudAggregationQueue.add('run', {});
  }

  // Every 30 minutes — process resolution events → clawbacks
  @Cron('*/30 * * * *')
  async scheduleHoldPropagation(): Promise<void> {
    await this.holdPropagationQueue.add('run', {});
  }

  // Every 30 minutes — process approved returns
  @Cron('*/30 * * * *')
  async scheduleReturnEligibility(): Promise<void> {
    await this.returnEligibilityQueue.add('run', {});
  }
}
