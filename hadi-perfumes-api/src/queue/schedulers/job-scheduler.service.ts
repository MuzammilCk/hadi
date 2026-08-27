import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import * as Bull from 'bull';

@Injectable()
export class JobSchedulerService {
  private readonly logger = new Logger(JobSchedulerService.name);

  constructor(
    @InjectQueue('commission-outbox')
    private commissionOutboxQueue: Bull.Queue,
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
    @InjectQueue('qualification-recalc')
    private qualificationRecalcQueue: Bull.Queue,
  ) {}

  // Fix A1: Every minute — process unpublished outbox events into commission calculations.
  // Without this cron entry, MoneyEventOutbox rows written by the Stripe webhook
  // are NEVER consumed, leaving the entire MLM commission system non-functional.
  @Cron(CronExpression.EVERY_MINUTE)
  async scheduleCommissionOutbox(): Promise<void> {
    await this.commissionOutboxQueue.add('run', {}, {
      jobId: `commission-outbox-${Date.now()}`,
    });
  }

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

  // Fix C3: Every 30 minutes — auto-recalculate ranks based on updated volumes.
  // Without this, users who qualify for rank upgrades only get promoted via manual admin trigger.
  @Cron('*/30 * * * *')
  async scheduleQualificationRecalc(): Promise<void> {
    await this.qualificationRecalcQueue.add('run', {}, {
      jobId: `qualification-recalc-${Date.now()}`,
    });
  }
}
