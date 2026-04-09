import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { TrustAuditLog } from '../entities/trust-audit-log.entity';

@Injectable()
export class TrustAuditService {
  constructor(
    @InjectRepository(TrustAuditLog)
    private readonly auditRepo: Repository<TrustAuditLog>,
  ) {}

  /**
   * Write one immutable audit log row. Accept an optional EntityManager
   * so callers within transactions can include the write atomically.
   */
  async log(
    params: {
      actorId: string | null;
      actorType: 'customer' | 'admin' | 'system';
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, any>;
    },
    em?: EntityManager,
  ): Promise<void> {
    const manager = em ?? this.auditRepo.manager;
    await manager.save(
      TrustAuditLog,
      manager.create(TrustAuditLog, {
        actor_id: params.actorId ?? undefined,
        actor_type: params.actorType,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        metadata: params.metadata ?? null,
      }),
    );
  }
}
