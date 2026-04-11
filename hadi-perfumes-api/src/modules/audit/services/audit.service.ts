import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { CreateAuditLogDto } from '../dto/create-audit-log.dto';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Log an audit event. NEVER throws — all errors are silently logged.
   * This ensures audit logging never breaks the calling service's flow.
   */
  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      const entry = this.auditRepo.create({
        actor_id: dto.actor_id ?? null,
        action: dto.action,
        entity_type: dto.entity_type,
        entity_id: dto.entity_id,
        before_snapshot: dto.before_snapshot ?? null,
        after_snapshot: dto.after_snapshot ?? null,
        ip_address: dto.ip_address ?? null,
        user_agent: dto.user_agent ?? null,
      });
      await this.auditRepo.save(entry);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log: ${dto.action} on ${dto.entity_type}:${dto.entity_id}`,
        error,
      );
      // NEVER throw — audit logging is best-effort
    }
  }

  async findLogs(
    query: AuditLogQueryDto,
  ): Promise<{ data: AuditLog[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.auditRepo
      .createQueryBuilder('audit')
      .orderBy('audit.created_at', 'DESC');

    if (query.entity_type) {
      qb.andWhere('audit.entity_type = :entityType', {
        entityType: query.entity_type,
      });
    }
    if (query.entity_id) {
      qb.andWhere('audit.entity_id = :entityId', {
        entityId: query.entity_id,
      });
    }
    if (query.action) {
      qb.andWhere('audit.action = :action', { action: query.action });
    }
    if (query.actor_id) {
      qb.andWhere('audit.actor_id = :actorId', { actorId: query.actor_id });
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
