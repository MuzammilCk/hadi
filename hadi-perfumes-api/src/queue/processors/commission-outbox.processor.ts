import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Bull from 'bull';
import { CommissionCalculationService } from '../../modules/commission/services/commission-calculation.service';
import { JobRun } from '../../modules/ops/entities/job-run.entity';
import { DeadLetterEvent } from '../../modules/ops/entities/dead-letter-event.entity';
import { QUEUE_NAMES } from '../queue.constants';

/**
 * Fix A1: BullMQ processor for the commission outbox.
 *
 * Without this processor + its cron trigger in JobSchedulerService,
 * MoneyEventOutbox rows written by the payment webhook are NEVER consumed,
 * leaving the entire MLM commission system non-functional.
 */
@Processor(QUEUE_NAMES.COMMISSION_OUTBOX)
@Injectable()
export class CommissionOutboxProcessor {
  private readonly logger = new Logger(CommissionOutboxProcessor.name);

  constructor(
    private readonly commissionCalcService: CommissionCalculationService,
    @InjectRepository(JobRun) private readonly jobRunRepo: Repository<JobRun>,
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
  ) {}

  @Process('run')
  async handleRun(job: Bull.Job): Promise<void> {
    const run = await this.jobRunRepo.save(
      this.jobRunRepo.create({
        job_name: 'CommissionOutboxProcessor',
        queue_name: QUEUE_NAMES.COMMISSION_OUTBOX,
        bull_job_id: String(job.id),
        status: 'running',
        attempt: job.attemptsMade + 1,
        payload: job.data,
        started_at: new Date(),
      }),
    );

    const start = Date.now();
    try {
      const result = await this.commissionCalcService.processUnpublishedEvents();

      await this.jobRunRepo.update(
        { id: run.id },
        {
          status: 'completed',
          result: result as any,
          duration_ms: Date.now() - start,
          completed_at: new Date(),
        },
      );
    } catch (err) {
      await this.jobRunRepo.update(
        { id: run.id },
        {
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err),
          duration_ms: Date.now() - start,
          completed_at: new Date(),
        },
      );
      throw err;
    }
  }

  @OnQueueFailed()
  async onFailed(job: Bull.Job, err: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      await this.deadLetterRepo.save(
        this.deadLetterRepo.create({
          job_name: 'CommissionOutboxProcessor',
          queue_name: QUEUE_NAMES.COMMISSION_OUTBOX,
          bull_job_id: String(job.id),
          payload: job.data,
          last_error: err.message,
          attempt_count: job.attemptsMade,
          replayable: true,
        }),
      );
      this.logger.error(
        `CommissionOutboxProcessor dead-lettered after ${job.attemptsMade} attempts: ${err.message}`,
      );
    }
  }
}
