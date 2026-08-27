import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import {
  PayoutHold,
  HoldStatus,
  HoldReasonType,
} from '../entities/payout-hold.entity';
import { CommissionHold } from '../entities/commission-hold.entity';
import { TrustAuditService } from '../../audit/services/trust-audit.service';
import {
  HoldNotFoundException,
  HoldAlreadyReleasedException,
} from '../exceptions/hold.exceptions';
import { EntityManager } from 'typeorm';

@Injectable()
export class HoldService {
  private readonly logger = new Logger(HoldService.name);

  constructor(
    @InjectRepository(PayoutHold)
    private readonly payoutHoldRepo: Repository<PayoutHold>,
    @InjectRepository(CommissionHold)
    private readonly commissionHoldRepo: Repository<CommissionHold>,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── PAYOUT HOLDS ─────────────────────────────────────────────

  async placePayoutHold(
    params: {
      userId: string;
      payoutRequestId?: string;
      reasonType: HoldReasonType;
      reasonRefId?: string;
      reasonRefType?: string;
      heldBy?: string;
      idempotencyKey: string;
    },
    em?: EntityManager,
  ): Promise<PayoutHold> {
    const manager = em ?? this.dataSource.manager;

    // Idempotency: if hold with key already exists, return it
    const existing = await manager.findOne(PayoutHold, {
      where: { idempotency_key: params.idempotencyKey },
    });
    if (existing) return existing;

    const hold = await manager.save(
      PayoutHold,
      manager.create(PayoutHold, {
        user_id: params.userId,
        payout_request_id: params.payoutRequestId ?? null,
        reason_type: params.reasonType,
        reason_ref_id: params.reasonRefId ?? null,
        reason_ref_type: params.reasonRefType ?? null,
        status: HoldStatus.ACTIVE,
        held_by: params.heldBy ?? null,
        idempotency_key: params.idempotencyKey,
      }),
    );

    await this.auditService.log(
      {
        actorId: params.heldBy ?? null,
        actorType: params.heldBy ? 'admin' : 'system',
        action: 'payout_hold.placed',
        entityType: 'payout_hold',
        entityId: hold.id,
        metadata: {
          reason_type: params.reasonType,
          reason_ref_id: params.reasonRefId,
        },
      },
      em,
    );

    return hold;
  }

  async releasePayoutHold(
    holdId: string,
    adminActorId: string,
    note?: string,
    em?: EntityManager,
  ): Promise<PayoutHold> {
    const manager = em ?? this.dataSource.manager;

    const hold = await manager.findOne(PayoutHold, { where: { id: holdId } });
    if (!hold) throw new HoldNotFoundException(holdId);
    if (hold.status !== HoldStatus.ACTIVE)
      throw new HoldAlreadyReleasedException();

    await manager.update(
      PayoutHold,
      { id: holdId },
      {
        status: HoldStatus.RELEASED,
        released_by: adminActorId,
        released_at: new Date(),
        release_note: note ?? null,
      },
    );

    await this.auditService.log(
      {
        actorId: adminActorId,
        actorType: 'admin',
        action: 'payout_hold.released',
        entityType: 'payout_hold',
        entityId: holdId,
        metadata: { note },
      },
      em,
    );

    const updated = await manager.findOne(PayoutHold, {
      where: { id: holdId },
    });
    return updated!;
  }

  async releasePayoutHoldByRef(
    refType: string,
    refId: string,
    adminActorId: string,
    note?: string,
    em?: EntityManager,
  ): Promise<void> {
    const manager = em ?? this.dataSource.manager;

    const activeHolds = await manager.find(PayoutHold, {
      where: {
        reason_ref_type: refType,
        reason_ref_id: refId,
        status: HoldStatus.ACTIVE,
      },
    });

    for (const hold of activeHolds) {
      await this.releasePayoutHold(hold.id, adminActorId, note, em);
    }
  }

  // ─── COMMISSION HOLDS ─────────────────────────────────────────

  async placeCommissionHold(
    params: {
      userId: string;
      commissionEventId?: string;
      reasonType: HoldReasonType;
      reasonRefId?: string;
      reasonRefType?: string;
      heldBy?: string;
      idempotencyKey: string;
    },
    em?: EntityManager,
  ): Promise<CommissionHold> {
    const manager = em ?? this.dataSource.manager;

    // Idempotency
    const existing = await manager.findOne(CommissionHold, {
      where: { idempotency_key: params.idempotencyKey },
    });
    if (existing) return existing;

    const hold = await manager.save(
      CommissionHold,
      manager.create(CommissionHold, {
        user_id: params.userId,
        commission_event_id: params.commissionEventId ?? null,
        reason_type: params.reasonType,
        reason_ref_id: params.reasonRefId ?? null,
        reason_ref_type: params.reasonRefType ?? null,
        status: HoldStatus.ACTIVE,
        held_by: params.heldBy ?? null,
        idempotency_key: params.idempotencyKey,
      }),
    );

    await this.auditService.log(
      {
        actorId: params.heldBy ?? null,
        actorType: params.heldBy ? 'admin' : 'system',
        action: 'commission_hold.placed',
        entityType: 'commission_hold',
        entityId: hold.id,
        metadata: {
          reason_type: params.reasonType,
          reason_ref_id: params.reasonRefId,
        },
      },
      em,
    );

    return hold;
  }

  async releaseCommissionHold(
    holdId: string,
    adminActorId: string,
    note?: string,
    em?: EntityManager,
  ): Promise<CommissionHold> {
    const manager = em ?? this.dataSource.manager;

    const hold = await manager.findOne(CommissionHold, {
      where: { id: holdId },
    });
    if (!hold) throw new HoldNotFoundException(holdId);
    if (hold.status !== HoldStatus.ACTIVE)
      throw new HoldAlreadyReleasedException();

    await manager.update(
      CommissionHold,
      { id: holdId },
      {
        status: HoldStatus.RELEASED,
        released_by: adminActorId,
        released_at: new Date(),
        release_note: note ?? null,
      },
    );

    await this.auditService.log(
      {
        actorId: adminActorId,
        actorType: 'admin',
        action: 'commission_hold.released',
        entityType: 'commission_hold',
        entityId: holdId,
        metadata: { note },
      },
      em,
    );

    const updated = await manager.findOne(CommissionHold, {
      where: { id: holdId },
    });
    return updated!;
  }
}
