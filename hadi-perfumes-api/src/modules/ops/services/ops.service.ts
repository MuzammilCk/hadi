import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { JobRun } from '../entities/job-run.entity';
import { DeadLetterEvent } from '../entities/dead-letter-event.entity';
import { SecurityEvent } from '../entities/security-event.entity';
import { TrustAuditLog } from '../../trust/audit/entities/trust-audit-log.entity';
import {
  ConflictException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import * as Bull from 'bull';

@Injectable()
export class OpsService {
  constructor(
    @InjectRepository(JobRun)
    private readonly jobRunRepo: Repository<JobRun>,
    @InjectRepository(DeadLetterEvent)
    private readonly deadLetterRepo: Repository<DeadLetterEvent>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepo: Repository<SecurityEvent>,
    @InjectRepository(TrustAuditLog)
    private readonly auditLogRepo: Repository<TrustAuditLog>,
    @InjectQueue('commission-release')
    private readonly commissionReleaseQueue: Bull.Queue,
    @InjectQueue('reservation-expiry')
    private readonly reservationExpiryQueue: Bull.Queue,
    @InjectQueue('dispute-escalation')
    private readonly disputeEscalationQueue: Bull.Queue,
    @InjectQueue('fraud-aggregation')
    private readonly fraudAggregationQueue: Bull.Queue,
    @InjectQueue('hold-propagation')
    private readonly holdPropagationQueue: Bull.Queue,
    @InjectQueue('return-eligibility')
    private readonly returnEligibilityQueue: Bull.Queue,
  ) {}

  // --- Job Runs ---

  async listJobRuns(query: {
    page?: number;
    limit?: number;
    from_date?: string;
    to_date?: string;
    job_name?: string;
    status?: string;
  }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.jobRunRepo
      .createQueryBuilder('jr')
      .orderBy('jr.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.job_name) {
      qb.andWhere('jr.job_name = :job_name', { job_name: query.job_name });
    }
    if (query.status) {
      qb.andWhere('jr.status = :status', { status: query.status });
    }
    if (query.from_date) {
      qb.andWhere('jr.created_at >= :from_date', {
        from_date: new Date(query.from_date),
      });
    }
    if (query.to_date) {
      qb.andWhere('jr.created_at <= :to_date', {
        to_date: new Date(query.to_date),
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getJobRun(id: string) {
    const run = await this.jobRunRepo.findOne({ where: { id } });
    if (!run) throw new NotFoundException(`JobRun ${id} not found`);
    return run;
  }

  // --- Dead Letter Events ---

  async listDeadLetterEvents(query: {
    page?: number;
    limit?: number;
    from_date?: string;
    to_date?: string;
    job_name?: string;
  }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.deadLetterRepo
      .createQueryBuilder('dl')
      .orderBy('dl.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.job_name) {
      qb.andWhere('dl.job_name = :job_name', { job_name: query.job_name });
    }
    if (query.from_date) {
      qb.andWhere('dl.created_at >= :from_date', {
        from_date: new Date(query.from_date),
      });
    }
    if (query.to_date) {
      qb.andWhere('dl.created_at <= :to_date', {
        to_date: new Date(query.to_date),
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async replayDeadLetterEvent(id: string, adminActorId: string) {
    const event = await this.deadLetterRepo.findOne({ where: { id } });
    if (!event)
      throw new NotFoundException(`DeadLetterEvent ${id} not found`);
    if (!event.replayable)
      throw new UnprocessableEntityException(
        `DeadLetterEvent ${id} is not marked as replayable — admin must confirm manually`,
      );
    if (event.replayed_at)
      throw new ConflictException(
        `DeadLetterEvent ${id} was already replayed at ${event.replayed_at.toISOString()}`,
      );

    // Enqueue to the correct BullMQ queue
    const queue = this.getQueueByName(event.queue_name);
    if (!queue) {
      throw new UnprocessableEntityException(
        `Unknown queue: ${event.queue_name}`,
      );
    }

    await queue.add('run', event.payload || {}, {
      jobId: `replay-${event.id}-${Date.now()}`,
    });

    // Mark as replayed
    await this.deadLetterRepo.update(
      { id: event.id },
      {
        replayed_at: new Date(),
        replayed_by: adminActorId,
      },
    );

    // Write audit log
    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        actor_id: adminActorId,
        actor_type: 'admin',
        action: 'dead_letter.replayed',
        entity_type: 'dead_letter_event',
        entity_id: event.id,
        metadata: { queue_name: event.queue_name, job_name: event.job_name },
      }),
    );

    return { replayed: true, dead_letter_event_id: event.id };
  }

  // --- Security Events ---

  async listSecurityEvents(query: {
    page?: number;
    limit?: number;
    from_date?: string;
    to_date?: string;
    event_type?: string;
  }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.securityEventRepo
      .createQueryBuilder('se')
      .orderBy('se.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.event_type) {
      qb.andWhere('se.event_type = :event_type', {
        event_type: query.event_type,
      });
    }
    if (query.from_date) {
      qb.andWhere('se.created_at >= :from_date', {
        from_date: new Date(query.from_date),
      });
    }
    if (query.to_date) {
      qb.andWhere('se.created_at <= :to_date', {
        to_date: new Date(query.to_date),
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  // --- Audit Logs (read-only from trust_audit_logs) ---

  async listAuditLogs(query: {
    page?: number;
    limit?: number;
    from_date?: string;
    to_date?: string;
    action?: string;
  }) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.auditLogRepo
      .createQueryBuilder('al')
      .orderBy('al.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.action) {
      qb.andWhere('al.action = :action', { action: query.action });
    }
    if (query.from_date) {
      qb.andWhere('al.created_at >= :from_date', {
        from_date: new Date(query.from_date),
      });
    }
    if (query.to_date) {
      qb.andWhere('al.created_at <= :to_date', {
        to_date: new Date(query.to_date),
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  // --- System Health Summary ---

  async getSystemHealthSummary() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Recent job counts by status
    const jobCounts = await this.jobRunRepo
      .createQueryBuilder('jr')
      .select('jr.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('jr.created_at >= :since', { since: last24h })
      .groupBy('jr.status')
      .getRawMany();

    // Dead letter count
    const deadLetterCount = await this.deadLetterRepo.count();

    // Last run timestamps per job type
    const lastRuns = await this.jobRunRepo
      .createQueryBuilder('jr')
      .select('jr.job_name', 'job_name')
      .addSelect('MAX(jr.created_at)', 'last_run')
      .groupBy('jr.job_name')
      .getRawMany();

    // Security event count (last 24h)
    const securityEventCount = await this.securityEventRepo
      .createQueryBuilder('se')
      .where('se.created_at >= :since', { since: last24h })
      .getCount();

    return {
      job_counts_24h: jobCounts,
      dead_letter_total: deadLetterCount,
      last_runs_per_job: lastRuns,
      security_events_24h: securityEventCount,
      checked_at: now.toISOString(),
    };
  }

  // --- Helpers ---

  private getQueueByName(queueName: string): Bull.Queue | null {
    const map: Record<string, Bull.Queue> = {
      'commission-release': this.commissionReleaseQueue,
      'reservation-expiry': this.reservationExpiryQueue,
      'dispute-escalation': this.disputeEscalationQueue,
      'fraud-aggregation': this.fraudAggregationQueue,
      'hold-propagation': this.holdPropagationQueue,
      'return-eligibility': this.returnEligibilityQueue,
    };
    return map[queueName] || null;
  }
}
