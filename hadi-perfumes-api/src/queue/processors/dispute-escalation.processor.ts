import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Bull from 'bull';
import { DisputeEscalationJob } from '../../modules/trust/jobs/dispute-escalation.job';
import { JobRun } from '../../modules/ops/entities/job-run.entity';
import { DeadLetterEvent } from '../../modules/ops/entities/dead-letter-event.entity';
import { QUEUE_NAMES } from '../queue.module';

@Processor(QUEUE_NAMES.DISPUTE_ESCALATION)
@Injectable()
export class DisputeEscalationProcessor {
  private readonly logger = new Logger(DisputeEscalationProcessor.name);

  constructor(
    private readonly disputeEscalationJob: DisputeEscalationJob,
    @InjectRepository(JobRun) private readonly jobRunRepo: Repository<JobRun>,
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
  ) {}

  @Process('run')
  async handleRun(job: Bull.Job): Promise<void> {
    const run = await this.jobRunRepo.save(
      this.jobRunRepo.create({
        job_name: 'DisputeEscalationJob',
        queue_name: QUEUE_NAMES.DISPUTE_ESCALATION,
        bull_job_id: String(job.id),
        status: 'running',
        attempt: job.attemptsMade + 1,
        payload: job.data,
        started_at: new Date(),
      }),
    );

    const start = Date.now();
    try {
      const result = await this.disputeEscalationJob.run();
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
          job_name: 'DisputeEscalationJob',
          queue_name: QUEUE_NAMES.DISPUTE_ESCALATION,
          bull_job_id: String(job.id),
          payload: job.data,
          last_error: err.message,
          attempt_count: job.attemptsMade,
          replayable: true,
        }),
      );
      this.logger.error(
        `DisputeEscalationJob dead-lettered after ${job.attemptsMade} attempts: ${err.message}`,
      );
    }
  }
}
