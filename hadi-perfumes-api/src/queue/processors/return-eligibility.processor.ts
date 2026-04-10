import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Bull from 'bull';
import { ReturnEligibilityJob } from '../../modules/trust/jobs/return-eligibility.job';
import { JobRun } from '../../modules/ops/entities/job-run.entity';
import { DeadLetterEvent } from '../../modules/ops/entities/dead-letter-event.entity';
import { QUEUE_NAMES } from '../queue.module';

@Processor(QUEUE_NAMES.RETURN_ELIGIBILITY)
@Injectable()
export class ReturnEligibilityProcessor {
  private readonly logger = new Logger(ReturnEligibilityProcessor.name);

  constructor(
    private readonly returnEligibilityJob: ReturnEligibilityJob,
    @InjectRepository(JobRun) private readonly jobRunRepo: Repository<JobRun>,
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
  ) {}

  @Process('run')
  async handleRun(job: Bull.Job): Promise<void> {
    const run = await this.jobRunRepo.save(
      this.jobRunRepo.create({
        job_name: 'ReturnEligibilityJob',
        queue_name: QUEUE_NAMES.RETURN_ELIGIBILITY,
        bull_job_id: String(job.id),
        status: 'running',
        attempt: job.attemptsMade + 1,
        payload: job.data,
        started_at: new Date(),
      }),
    );

    const start = Date.now();
    try {
      const result = await this.returnEligibilityJob.processApproved();
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
          job_name: 'ReturnEligibilityJob',
          queue_name: QUEUE_NAMES.RETURN_ELIGIBILITY,
          bull_job_id: String(job.id),
          payload: job.data,
          last_error: err.message,
          attempt_count: job.attemptsMade,
          replayable: false,
        }),
      );
      this.logger.error(
        `ReturnEligibilityJob dead-lettered after ${job.attemptsMade} attempts: ${err.message}`,
      );
    }
  }
}
