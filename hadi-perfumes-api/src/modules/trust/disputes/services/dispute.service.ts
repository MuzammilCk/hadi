import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Dispute,
  DisputeStatus,
  DisputeResolution,
} from '../entities/dispute.entity';
import { DisputeEvidence } from '../entities/dispute-evidence.entity';
import { DisputeStatusHistory } from '../entities/dispute-status-history.entity';
import { ResolutionEvent } from '../../holds/entities/resolution-event.entity';
import { Order } from '../../../order/entities/order.entity';
import { HoldService } from '../../holds/services/hold.service';
import { TrustAuditService } from '../../audit/services/trust-audit.service';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { DisputeQueryDto } from '../dto/dispute-query.dto';
import { AdminDisputeDecisionDto } from '../dto/admin-dispute-decision.dto';
import { SubmitEvidenceDto } from '../dto/submit-evidence.dto';
import { HoldReasonType } from '../../holds/entities/payout-hold.entity';
import {
  DisputeNotFoundException,
  DisputeAlreadyExistsException,
  DisputeNotResolvableException,
  DisputeAlreadyClosedException,
  DisputeStatusTransitionException,
} from '../exceptions/dispute.exceptions';

@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    @InjectRepository(DisputeEvidence)
    private readonly evidenceRepo: Repository<DisputeEvidence>,
    @InjectRepository(DisputeStatusHistory)
    private readonly statusHistoryRepo: Repository<DisputeStatusHistory>,
    @InjectRepository(ResolutionEvent)
    private readonly resolutionEventRepo: Repository<ResolutionEvent>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly holdService: HoldService,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async openDispute(
    buyerId: string,
    dto: CreateDisputeDto,
    idempotencyKey: string,
  ): Promise<Dispute> {
    // Idempotency check (outside tx, read-only)
    const existing = await this.disputeRepo.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    if (existing) return existing;

    return this.dataSource.transaction(async (em) => {
      // Verify order exists and belongs to buyer
      const order = await em.findOne(Order, { where: { id: dto.order_id } });
      if (!order) throw new DisputeNotResolvableException('order not found');
      if (order.buyer_id !== buyerId)
        throw new DisputeNotResolvableException(
          'order does not belong to this buyer',
        );

      // Check no open/under_review dispute for same order
      const openDispute = await em.findOne(Dispute, {
        where: [
          { order_id: dto.order_id, status: DisputeStatus.OPEN },
          { order_id: dto.order_id, status: DisputeStatus.UNDER_REVIEW },
        ],
      });
      if (openDispute) throw new DisputeAlreadyExistsException();

      // Create dispute
      const dispute = await em.save(
        Dispute,
        em.create(Dispute, {
          order_id: dto.order_id,
          buyer_id: buyerId,
          return_request_id: dto.return_request_id ?? null,
          reason_code: dto.reason_code,
          reason_detail: dto.reason_detail ?? null,
          status: DisputeStatus.OPEN,
          idempotency_key: idempotencyKey,
        }),
      );

      // Write status history
      await em.save(
        DisputeStatusHistory,
        em.create(DisputeStatusHistory, {
          dispute_id: dispute.id,
          from_status: null,
          to_status: DisputeStatus.OPEN,
          actor_id: buyerId,
          actor_type: 'customer',
        }),
      );

      // Place payout hold
      await this.holdService.placePayoutHold(
        {
          userId: order.buyer_id,
          reasonType: HoldReasonType.DISPUTE_OPEN,
          reasonRefId: dispute.id,
          reasonRefType: 'dispute',
          idempotencyKey: `payout-hold:dispute:${dispute.id}`,
        },
        em,
      );

      // Audit log
      await this.auditService.log(
        {
          actorId: buyerId,
          actorType: 'customer',
          action: 'dispute.opened',
          entityType: 'dispute',
          entityId: dispute.id,
          metadata: { order_id: dto.order_id, reason_code: dto.reason_code },
        },
        em,
      );

      return dispute;
    });
  }

  async submitEvidence(
    disputeId: string,
    uploaderId: string,
    dto: SubmitEvidenceDto,
  ): Promise<DisputeEvidence> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
    });
    if (!dispute) throw new DisputeNotFoundException(disputeId);
    if (
      [DisputeStatus.CLOSED, DisputeStatus.RESOLVED].includes(
        dispute.status as DisputeStatus,
      )
    ) {
      throw new DisputeAlreadyClosedException();
    }

    const evidence = await this.evidenceRepo.save(
      this.evidenceRepo.create({
        dispute_id: disputeId,
        uploaded_by: uploaderId,
        file_key: dto.file_key,
        file_type: dto.file_type ?? null,
        description: dto.description ?? null,
      }),
    );

    await this.auditService.log({
      actorId: uploaderId,
      actorType: 'customer',
      action: 'dispute.evidence_submitted',
      entityType: 'dispute',
      entityId: disputeId,
      metadata: { evidence_id: evidence.id },
    });

    return evidence;
  }

  async resolveDispute(
    disputeId: string,
    adminActorId: string,
    dto: AdminDisputeDecisionDto,
  ): Promise<Dispute> {
    return this.dataSource.transaction(async (em) => {
      const dispute = await em.findOne(Dispute, { where: { id: disputeId } });
      if (!dispute) throw new DisputeNotFoundException(disputeId);

      if (
        ![
          DisputeStatus.OPEN,
          DisputeStatus.UNDER_REVIEW,
          DisputeStatus.ESCALATED,
        ].includes(dispute.status as DisputeStatus)
      ) {
        throw new DisputeNotResolvableException(dispute.status);
      }

      const fromStatus = dispute.status;
      const clawbackResolutions = [
        DisputeResolution.REFUND_GRANTED,
        DisputeResolution.PARTIAL_REFUND,
        DisputeResolution.CLAWBACK_ISSUED,
      ];
      const shouldClawback = clawbackResolutions.includes(dto.resolution);

      await em.update(
        Dispute,
        { id: disputeId },
        {
          status: DisputeStatus.RESOLVED,
          resolution: dto.resolution,
          resolved_by: adminActorId,
          resolved_at: new Date(),
          resolution_note: dto.note ?? null,
          clawback_triggered: shouldClawback,
        },
      );

      await em.save(
        DisputeStatusHistory,
        em.create(DisputeStatusHistory, {
          dispute_id: disputeId,
          from_status: fromStatus,
          to_status: DisputeStatus.RESOLVED,
          actor_id: adminActorId,
          actor_type: 'admin',
          note: dto.note ?? null,
        }),
      );

      // Write resolution event if clawback needed
      if (shouldClawback) {
        try {
          await em.save(
            ResolutionEvent,
            em.create(ResolutionEvent, {
              entity_type: 'dispute',
              entity_id: disputeId,
              resolution_type: 'clawback_triggered',
              actor_id: adminActorId,
              actor_type: 'admin',
              note: `Clawback triggered for dispute ${disputeId}: ${dto.resolution}`,
              idempotency_key: `dispute-clawback:${disputeId}`,
            }),
          );
        } catch (err: any) {
          if (
            !err?.message?.includes('UQ_resolution_events_idempotency_key') &&
            !err?.message?.includes('UNIQUE constraint')
          ) {
            throw err;
          }
        }
      }

      // Release payout hold
      await this.holdService.releasePayoutHoldByRef(
        'dispute',
        disputeId,
        adminActorId,
        dto.note,
        em,
      );

      // Audit log
      await this.auditService.log(
        {
          actorId: adminActorId,
          actorType: 'admin',
          action: 'dispute.resolved',
          entityType: 'dispute',
          entityId: disputeId,
          metadata: {
            resolution: dto.resolution,
            clawback_triggered: shouldClawback,
          },
        },
        em,
      );

      return (await em.findOne(Dispute, { where: { id: disputeId } }))!;
    });
  }

  async escalateDispute(
    disputeId: string,
    adminActorId: string,
    note?: string,
  ): Promise<Dispute> {
    return this.dataSource.transaction(async (em) => {
      const dispute = await em.findOne(Dispute, { where: { id: disputeId } });
      if (!dispute) throw new DisputeNotFoundException(disputeId);

      if (
        ![DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW].includes(
          dispute.status as DisputeStatus,
        )
      ) {
        throw new DisputeStatusTransitionException(dispute.status, 'escalated');
      }

      const fromStatus = dispute.status;
      await em.update(
        Dispute,
        { id: disputeId },
        {
          status: DisputeStatus.ESCALATED,
          escalated_at: new Date(),
        },
      );

      await em.save(
        DisputeStatusHistory,
        em.create(DisputeStatusHistory, {
          dispute_id: disputeId,
          from_status: fromStatus,
          to_status: DisputeStatus.ESCALATED,
          actor_id: adminActorId,
          actor_type: 'admin',
          note: note ?? null,
        }),
      );

      await this.auditService.log(
        {
          actorId: adminActorId,
          actorType: 'admin',
          action: 'dispute.escalated',
          entityType: 'dispute',
          entityId: disputeId,
        },
        em,
      );

      return (await em.findOne(Dispute, { where: { id: disputeId } }))!;
    });
  }

  async closeDispute(
    disputeId: string,
    adminActorId: string,
    note?: string,
  ): Promise<Dispute> {
    return this.dataSource.transaction(async (em) => {
      const dispute = await em.findOne(Dispute, { where: { id: disputeId } });
      if (!dispute) throw new DisputeNotFoundException(disputeId);

      if (
        ![DisputeStatus.RESOLVED, DisputeStatus.ESCALATED].includes(
          dispute.status as DisputeStatus,
        )
      ) {
        throw new DisputeStatusTransitionException(dispute.status, 'closed');
      }

      const fromStatus = dispute.status;
      await em.update(
        Dispute,
        { id: disputeId },
        {
          status: DisputeStatus.CLOSED,
          closed_at: new Date(),
        },
      );

      await em.save(
        DisputeStatusHistory,
        em.create(DisputeStatusHistory, {
          dispute_id: disputeId,
          from_status: fromStatus,
          to_status: DisputeStatus.CLOSED,
          actor_id: adminActorId,
          actor_type: 'admin',
          note: note ?? null,
        }),
      );

      await this.auditService.log(
        {
          actorId: adminActorId,
          actorType: 'admin',
          action: 'dispute.closed',
          entityType: 'dispute',
          entityId: disputeId,
        },
        em,
      );

      return (await em.findOne(Dispute, { where: { id: disputeId } }))!;
    });
  }

  async listMyDisputes(
    buyerId: string,
    query: DisputeQueryDto,
  ): Promise<{ data: Dispute[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.disputeRepo
      .createQueryBuilder('d')
      .where('d.buyer_id = :buyerId', { buyerId });
    if (query.status)
      qb.andWhere('d.status = :status', { status: query.status });
    qb.orderBy('d.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getDispute(disputeId: string, requesterId?: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
    });
    if (!dispute) throw new DisputeNotFoundException(disputeId);
    if (requesterId && dispute.buyer_id !== requesterId) {
      throw new DisputeNotFoundException(disputeId);
    }
    return dispute;
  }

  async adminListDisputes(
    query: DisputeQueryDto,
  ): Promise<{ data: Dispute[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.disputeRepo.createQueryBuilder('d').where('1=1');
    if (query.status)
      qb.andWhere('d.status = :status', { status: query.status });
    qb.orderBy('d.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async adminGetDispute(disputeId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
    });
    if (!dispute) throw new DisputeNotFoundException(disputeId);
    return dispute;
  }
}
