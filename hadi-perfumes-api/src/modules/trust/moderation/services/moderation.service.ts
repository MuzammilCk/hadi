import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ModerationAction } from '../entities/moderation-action.entity';
import { TrustAuditService } from '../../audit/services/trust-audit.service';
import { CreateModerationActionDto } from '../dto/create-moderation-action.dto';
import { ModerationQueryDto } from '../dto/moderation-query.dto';
import {
  ModerationActionNotFoundException,
  ModerationActionAlreadyReversedException,
} from '../exceptions/moderation.exceptions';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @InjectRepository(ModerationAction)
    private readonly moderationRepo: Repository<ModerationAction>,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async applyModerationAction(
    actorId: string,
    dto: CreateModerationActionDto,
  ): Promise<ModerationAction> {
    // Idempotency check
    const existing = await this.moderationRepo.findOne({
      where: { idempotency_key: dto.idempotency_key },
    });
    if (existing) return existing;

    const action = await this.moderationRepo.save(
      this.moderationRepo.create({
        target_type: dto.target_type,
        target_id: dto.target_id,
        action_type: dto.action_type,
        reason: dto.reason,
        actor_id: actorId,
        actor_type: 'admin',
        expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
        idempotency_key: dto.idempotency_key,
      }),
    );

    await this.auditService.log({
      actorId,
      actorType: 'admin',
      action: `moderation.${dto.action_type}`,
      entityType: 'moderation_action',
      entityId: action.id,
      metadata: { target_type: dto.target_type, target_id: dto.target_id },
    });

    return action;
  }

  async reverseModerationAction(
    actionId: string,
    adminActorId: string,
    note?: string,
  ): Promise<ModerationAction> {
    const action = await this.moderationRepo.findOne({
      where: { id: actionId },
    });
    if (!action) throw new ModerationActionNotFoundException(actionId);
    if (action.reversed_at)
      throw new ModerationActionAlreadyReversedException();

    await this.moderationRepo.update(
      { id: actionId },
      {
        reversed_at: new Date(),
        reversed_by: adminActorId,
      },
    );

    await this.auditService.log({
      actorId: adminActorId,
      actorType: 'admin',
      action: 'moderation.reversed',
      entityType: 'moderation_action',
      entityId: actionId,
      metadata: { note },
    });

    return (await this.moderationRepo.findOne({ where: { id: actionId } }))!;
  }

  async listModerationActions(query: ModerationQueryDto): Promise<{
    data: ModerationAction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.moderationRepo.createQueryBuilder('ma').where('1=1');
    if (query.target_type)
      qb.andWhere('ma.target_type = :targetType', {
        targetType: query.target_type,
      });
    if (query.target_id)
      qb.andWhere('ma.target_id = :targetId', { targetId: query.target_id });
    qb.orderBy('ma.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getModerationAction(id: string): Promise<ModerationAction> {
    const action = await this.moderationRepo.findOne({ where: { id } });
    if (!action) throw new ModerationActionNotFoundException(id);
    return action;
  }
}
