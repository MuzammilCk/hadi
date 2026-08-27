import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import {
  ReturnRequest,
  ReturnRequestStatus,
  ReturnReasonCode,
} from '../entities/return-request.entity';
import { ReturnItem } from '../entities/return-item.entity';
import { ReturnEvidence } from '../entities/return-evidence.entity';
import { ReturnStatusHistory } from '../entities/return-status-history.entity';
import { ResolutionEvent } from '../../holds/entities/resolution-event.entity';
import { Order } from '../../../order/entities/order.entity';
import { TrustAuditService } from '../../audit/services/trust-audit.service';
import { CreateReturnDto } from '../dto/create-return.dto';
import { ReturnQueryDto } from '../dto/return-query.dto';
import {
  ReturnRequestNotFoundException,
  ReturnAlreadyExistsException,
  ReturnIneligibleException,
  ReturnWindowExpiredException,
  ReturnStatusTransitionException,
} from '../exceptions/return.exceptions';

@Injectable()
export class ReturnService {
  private readonly logger = new Logger(ReturnService.name);

  constructor(
    @InjectRepository(ReturnRequest)
    private readonly returnRequestRepo: Repository<ReturnRequest>,
    @InjectRepository(ReturnItem)
    private readonly returnItemRepo: Repository<ReturnItem>,
    @InjectRepository(ReturnEvidence)
    private readonly returnEvidenceRepo: Repository<ReturnEvidence>,
    @InjectRepository(ReturnStatusHistory)
    private readonly statusHistoryRepo: Repository<ReturnStatusHistory>,
    @InjectRepository(ResolutionEvent)
    private readonly resolutionEventRepo: Repository<ResolutionEvent>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async createReturn(
    buyerId: string,
    dto: CreateReturnDto,
    idempotencyKey: string,
  ): Promise<ReturnRequest> {
    // Idempotency check (outside tx, read-only)
    const existing = await this.returnRequestRepo.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    if (existing) return existing;

    return this.dataSource.transaction(async (em) => {
      // Verify order exists and belongs to buyer
      const order = await em.findOne(Order, { where: { id: dto.order_id } });
      if (!order) throw new ReturnIneligibleException('order not found');
      if (order.buyer_id !== buyerId)
        throw new ReturnIneligibleException(
          'order does not belong to this buyer',
        );

      // Verify order status allows returns
      if (!['delivered', 'completed'].includes(order.status)) {
        throw new ReturnIneligibleException(
          `order status '${order.status}' is not eligible for return`,
        );
      }

      // Check return window using completed_at (no delivered_at on Order entity)
      // Fix M3: use created_at as fallback — updated_at changes on any status update, silently extending window
      const windowDays = parseInt(process.env.RETURN_WINDOW_DAYS || '30', 10);
      const anchorDate = order.completed_at ?? order.created_at;
      if (anchorDate) {
        const windowEnd = new Date(
          anchorDate.getTime() + windowDays * 24 * 60 * 60 * 1000,
        );
        if (new Date() > windowEnd) {
          throw new ReturnWindowExpiredException();
        }
      }

      // Check no open/approved return for same order
      const openReturn = await em.findOne(ReturnRequest, {
        where: [
          {
            order_id: dto.order_id,
            status: ReturnRequestStatus.PENDING_REVIEW,
          },
          { order_id: dto.order_id, status: ReturnRequestStatus.APPROVED },
        ],
      });
      if (openReturn) throw new ReturnAlreadyExistsException();

      // Create return request
      const returnRequest = await em.save(
        ReturnRequest,
        em.create(ReturnRequest, {
          order_id: dto.order_id,
          buyer_id: buyerId,
          reason_code: dto.reason_code,
          reason_detail: dto.reason_detail ?? null,
          status: ReturnRequestStatus.PENDING_REVIEW,
          idempotency_key: idempotencyKey,
        }),
      );

      // Create return items if provided
      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          await em.save(
            ReturnItem,
            em.create(ReturnItem, {
              return_request_id: returnRequest.id,
              order_item_id: item.order_item_id,
              quantity: item.quantity,
              reason_code: item.reason_code ?? null,
            }),
          );
        }
      }

      // Write status history
      await em.save(
        ReturnStatusHistory,
        em.create(ReturnStatusHistory, {
          return_request_id: returnRequest.id,
          from_status: null,
          to_status: ReturnRequestStatus.PENDING_REVIEW,
          actor_id: buyerId,
          actor_type: 'customer',
        }),
      );

      // Audit log
      await this.auditService.log(
        {
          actorId: buyerId,
          actorType: 'customer',
          action: 'return.created',
          entityType: 'return_request',
          entityId: returnRequest.id,
          metadata: { order_id: dto.order_id, reason_code: dto.reason_code },
        },
        em,
      );

      return returnRequest;
    });
  }

  async approveReturn(
    returnId: string,
    adminActorId: string,
    note?: string,
  ): Promise<ReturnRequest> {
    return this.dataSource.transaction(async (em) => {
      const ret = await em.findOne(ReturnRequest, { where: { id: returnId } });
      if (!ret) throw new ReturnRequestNotFoundException(returnId);

      if (
        ![
          ReturnRequestStatus.PENDING_REVIEW,
          ReturnRequestStatus.ESCALATED,
        ].includes(ret.status as ReturnRequestStatus)
      ) {
        throw new ReturnStatusTransitionException(ret.status, 'approved');
      }

      const fromStatus = ret.status;
      await em.update(
        ReturnRequest,
        { id: returnId },
        {
          status: ReturnRequestStatus.APPROVED,
          decided_by: adminActorId,
          decided_at: new Date(),
          decision_note: note ?? null,
        },
      );

      await em.save(
        ReturnStatusHistory,
        em.create(ReturnStatusHistory, {
          return_request_id: returnId,
          from_status: fromStatus,
          to_status: ReturnRequestStatus.APPROVED,
          actor_id: adminActorId,
          actor_type: 'admin',
          note: note ?? null,
        }),
      );

      await this.auditService.log(
        {
          actorId: adminActorId,
          actorType: 'admin',
          action: 'return.approved',
          entityType: 'return_request',
          entityId: returnId,
        },
        em,
      );

      return (await em.findOne(ReturnRequest, { where: { id: returnId } }))!;
    });
  }

  async rejectReturn(
    returnId: string,
    adminActorId: string,
    note?: string,
  ): Promise<ReturnRequest> {
    return this.dataSource.transaction(async (em) => {
      const ret = await em.findOne(ReturnRequest, { where: { id: returnId } });
      if (!ret) throw new ReturnRequestNotFoundException(returnId);

      if (
        ![
          ReturnRequestStatus.PENDING_REVIEW,
          ReturnRequestStatus.ESCALATED,
        ].includes(ret.status as ReturnRequestStatus)
      ) {
        throw new ReturnStatusTransitionException(ret.status, 'rejected');
      }

      const fromStatus = ret.status;
      await em.update(
        ReturnRequest,
        { id: returnId },
        {
          status: ReturnRequestStatus.REJECTED,
          decided_by: adminActorId,
          decided_at: new Date(),
          decision_note: note ?? null,
        },
      );

      await em.save(
        ReturnStatusHistory,
        em.create(ReturnStatusHistory, {
          return_request_id: returnId,
          from_status: fromStatus,
          to_status: ReturnRequestStatus.REJECTED,
          actor_id: adminActorId,
          actor_type: 'admin',
          note: note ?? null,
        }),
      );

      await this.auditService.log(
        {
          actorId: adminActorId,
          actorType: 'admin',
          action: 'return.rejected',
          entityType: 'return_request',
          entityId: returnId,
        },
        em,
      );

      return (await em.findOne(ReturnRequest, { where: { id: returnId } }))!;
    });
  }

  async completeReturn(
    returnId: string,
    adminActorId: string,
    note?: string,
  ): Promise<ReturnRequest> {
    return this.dataSource.transaction(async (em) => {
      const ret = await em.findOne(ReturnRequest, { where: { id: returnId } });
      if (!ret) throw new ReturnRequestNotFoundException(returnId);

      if (ret.status !== ReturnRequestStatus.APPROVED) {
        throw new ReturnStatusTransitionException(ret.status, 'completed');
      }

      const fromStatus = ret.status;
      await em.update(
        ReturnRequest,
        { id: returnId },
        {
          status: ReturnRequestStatus.COMPLETED,
          refund_triggered: true,
          clawback_triggered: true,
          decision_note: note ?? ret.decision_note ?? null,
        },
      );

      // Write ResolutionEvent: refund triggered (idempotent via unique key)
      try {
        await em.save(
          ResolutionEvent,
          em.create(ResolutionEvent, {
            entity_type: 'return_request',
            entity_id: returnId,
            resolution_type: 'refund_triggered',
            actor_id: adminActorId,
            actor_type: 'admin',
            note: `Refund triggered for return ${returnId}`,
            idempotency_key: `return-refund:${returnId}`,
          }),
        );
      } catch (err: any) {
        // Idempotency: unique constraint violation means event already exists
        if (
          !err?.message?.includes('UQ_resolution_events_idempotency_key') &&
          !err?.message?.includes('UNIQUE constraint')
        ) {
          throw err;
        }
      }

      // Write ResolutionEvent: clawback triggered
      try {
        await em.save(
          ResolutionEvent,
          em.create(ResolutionEvent, {
            entity_type: 'return_request',
            entity_id: returnId,
            resolution_type: 'clawback_triggered',
            actor_id: adminActorId,
            actor_type: 'admin',
            note: `Clawback triggered for return ${returnId}`,
            idempotency_key: `return-clawback:${returnId}`,
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

      await em.save(
        ReturnStatusHistory,
        em.create(ReturnStatusHistory, {
          return_request_id: returnId,
          from_status: fromStatus,
          to_status: ReturnRequestStatus.COMPLETED,
          actor_id: adminActorId,
          actor_type: 'admin',
          note: note ?? null,
        }),
      );

      await this.auditService.log(
        {
          actorId: adminActorId,
          actorType: 'admin',
          action: 'return.completed',
          entityType: 'return_request',
          entityId: returnId,
          metadata: { refund_triggered: true, clawback_triggered: true },
        },
        em,
      );

      return (await em.findOne(ReturnRequest, { where: { id: returnId } }))!;
    });
  }

  async listMyReturns(
    buyerId: string,
    query: ReturnQueryDto,
  ): Promise<{
    data: ReturnRequest[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.returnRequestRepo
      .createQueryBuilder('rr')
      .where('rr.buyer_id = :buyerId', { buyerId });
    if (query.status)
      qb.andWhere('rr.status = :status', { status: query.status });
    qb.orderBy('rr.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getReturn(
    returnId: string,
    requesterId?: string,
  ): Promise<ReturnRequest> {
    const ret = await this.returnRequestRepo.findOne({
      where: { id: returnId },
    });
    if (!ret) throw new ReturnRequestNotFoundException(returnId);
    if (requesterId && ret.buyer_id !== requesterId) {
      throw new ReturnRequestNotFoundException(returnId);
    }
    return ret;
  }

  async adminListReturns(query: ReturnQueryDto): Promise<{
    data: ReturnRequest[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.returnRequestRepo.createQueryBuilder('rr').where('1=1');
    if (query.status)
      qb.andWhere('rr.status = :status', { status: query.status });
    qb.orderBy('rr.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async adminGetReturn(returnId: string): Promise<ReturnRequest> {
    const ret = await this.returnRequestRepo.findOne({
      where: { id: returnId },
    });
    if (!ret) throw new ReturnRequestNotFoundException(returnId);
    return ret;
  }
}
