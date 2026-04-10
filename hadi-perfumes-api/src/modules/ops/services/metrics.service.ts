import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobRun } from '../entities/job-run.entity';
import { DeadLetterEvent } from '../entities/dead-letter-event.entity';
import { SecurityEvent } from '../entities/security-event.entity';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(JobRun)
    private readonly jobRunRepo: Repository<JobRun>,
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepo: Repository<SecurityEvent>,
  ) {}

  async getSummary() {
    const now = new Date();
    const last1h = new Date(now.getTime() - 60 * 60 * 1000);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Jobs in last hour
    const recentJobsCount = await this.jobRunRepo
      .createQueryBuilder('jr')
      .where('jr.created_at >= :since', { since: last1h })
      .getCount();

    // Failed jobs in last 24h
    const failedJobsCount = await this.jobRunRepo
      .createQueryBuilder('jr')
      .where('jr.status = :status', { status: 'failed' })
      .andWhere('jr.created_at >= :since', { since: last24h })
      .getCount();

    // Completed jobs in last 24h
    const completedJobsCount = await this.jobRunRepo
      .createQueryBuilder('jr')
      .where('jr.status = :status', { status: 'completed' })
      .andWhere('jr.created_at >= :since', { since: last24h })
      .getCount();

    // Dead letter count
    const deadLetterCount = await this.deadLetterRepo.count();

    // Pending replay count
    const pendingReplayCount = await this.deadLetterRepo
      .createQueryBuilder('dl')
      .where('dl.replayable = :replayable', { replayable: true })
      .andWhere('dl.replayed_at IS NULL')
      .getCount();

    // Security events in last 24h
    const securityEvents24h = await this.securityEventRepo
      .createQueryBuilder('se')
      .where('se.created_at >= :since', { since: last24h })
      .getCount();

    // Avg job duration (last 24h, completed only)
    const avgDuration = await this.jobRunRepo
      .createQueryBuilder('jr')
      .select('AVG(jr.duration_ms)', 'avg_duration_ms')
      .where('jr.status = :status', { status: 'completed' })
      .andWhere('jr.created_at >= :since', { since: last24h })
      .getRawOne();

    // Memory usage
    const memUsage = process.memoryUsage();

    return {
      uptime_seconds: Math.floor(process.uptime()),
      memory: {
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      },
      jobs: {
        recent_1h: recentJobsCount,
        completed_24h: completedJobsCount,
        failed_24h: failedJobsCount,
        avg_duration_ms: avgDuration?.avg_duration_ms
          ? Math.round(Number(avgDuration.avg_duration_ms))
          : null,
      },
      dead_letter: {
        total: deadLetterCount,
        pending_replay: pendingReplayCount,
      },
      security_events_24h: securityEvents24h,
      checked_at: now.toISOString(),
    };
  }
}
