import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Bull from 'bull';
import { QualificationRecalcJob } from '../../jobs/qualification-recalc.job';
import { AdminPolicyService } from '../../modules/commission/services/admin-policy.service';
import { JobRun } from '../../modules/ops/entities/job-run.entity';
import { DeadLetterEvent } from '../../modules/ops/entities/dead-letter-event.entity';
import { QUEUE_NAMES } from '../queue.constants';

/**
 * Fix C3: Auto rank recalculation processor.
 * Triggered on a periodic schedule after commission releases mature.
 * Runs a full qualification recalculation using the active compensation policy.
 */
@Processor(QUEUE_NAMES.QUALIFICATION_RECALC)
@Injectable()
export class QualificationRecalcProcessor {
  private readonly logger = new Logger(QualificationRecalcProcessor.name);

  constructor(
    private readonly qualRecalcJob: QualificationRecalcJob,
    private readonly adminPolicyService: AdminPolicyService,
    @InjectRepository(JobRun) private readonly jobRunRepo: Repository<JobRun>,
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
  ) {}

  @Process('run')
  async handleRun(job: Bull.Job): Promise<void> {
    const run = await this.jobRunRepo.save(
      this.jobRunRepo.create({
        job_name: 'QualificationRecalcJob',
        queue_name: QUEUE_NAMES.QUALIFICATION_RECALC,
        bull_job_id: String(job.id),
        status: 'running',
        attempt: job.attemptsMade + 1,
        payload: job.data,
        started_at: new Date(),
      }),
    );

    const start = Date.now();
    try {
      const policy = await this.adminPolicyService.getCurrentActivePolicy();
      if (!policy) {
        this.logger.warn('No active compensation policy — skipping rank recalc');
        await this.jobRunRepo.update(
          { id: run.id },
          {
            status: 'completed',
            result: { skipped: true, reason: 'no_active_policy' } as any,
            duration_ms: Date.now() - start,
            completed_at: new Date(),
          },
        );
        return;
      }

      const result = await this.qualRecalcJob.run(policy.id);

      await this.jobRunRepo.update(
        { id: run.id },
        {
          status: 'completed',
          result: { nodes_processed: result.nodes_processed } as any,
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
          job_name: 'QualificationRecalcJob',
          queue_name: QUEUE_NAMES.QUALIFICATION_RECALC,
          bull_job_id: String(job.id),
          payload: job.data,
          last_error: err.message,
          attempt_count: job.attemptsMade,
          replayable: true,
        }),
      );
      this.logger.error(
        `QualificationRecalcJob dead-lettered after ${job.attemptsMade} attempts: ${err.message}`,
      );
    }
  }
}
