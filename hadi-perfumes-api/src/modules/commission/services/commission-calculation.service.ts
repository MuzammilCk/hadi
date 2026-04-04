import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommissionEvent } from '../entities/commission-event.entity';
import { CommissionEventSource } from '../entities/commission-event-source.entity';
import { MoneyEventOutbox } from '../../order/entities/money-event-outbox.entity';
import { NetworkNode } from '../../network/entities/network-node.entity';
import { QualificationState } from '../../network/entities/qualification-state.entity';
import { Order } from '../../order/entities/order.entity';
import { AdminPolicyService } from './admin-policy.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { LedgerEntryType, LedgerEntryStatus } from '../../ledger/entities/ledger-entry.entity';

@Injectable()
export class CommissionCalculationService {
  private readonly logger = new Logger(CommissionCalculationService.name);

  constructor(
    @InjectRepository(MoneyEventOutbox) private outboxRepo: Repository<MoneyEventOutbox>,
    @InjectRepository(CommissionEvent) private commissionEventRepo: Repository<CommissionEvent>,
    @InjectRepository(CommissionEventSource) private sourceRepo: Repository<CommissionEventSource>,
    @InjectRepository(NetworkNode) private networkNodeRepo: Repository<NetworkNode>,
    @InjectRepository(QualificationState) private qualStateRepo: Repository<QualificationState>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    private readonly adminPolicyService: AdminPolicyService,
    private readonly ledgerService: LedgerService,
    private readonly dataSource: DataSource,
  ) {}

  async processOutboxEvent(outboxEvent: MoneyEventOutbox): Promise<void> {
    if (outboxEvent.published) {
      this.logger.debug(`Outbox ${outboxEvent.id} already published — skip`);
      return;
    }

    const payload = outboxEvent.payload as {
      order_id: string; buyer_id: string; total_amount: number;
      currency: string; paid_at: string;
    };

    // Verify order is actually paid — don't trust payload alone
    const order = await this.orderRepo.findOne({ where: { id: payload.order_id } });
    if (!order || order.status !== 'paid') {
      this.logger.warn(`Order ${payload.order_id} not in paid status — skipping`);
      await this.outboxRepo.update({ id: outboxEvent.id }, { published: true, published_at: new Date() });
      return;
    }

    const policy = await this.adminPolicyService.getCurrentActivePolicy();
    if (!policy?.commission_rules?.length) {
      this.logger.warn('No active policy with commission rules — skipping');
      await this.outboxRepo.update({ id: outboxEvent.id }, { published: true, published_at: new Date() });
      return;
    }

    const rulesByLevel = new Map(policy.commission_rules.map(r => [r.level, r]));
    const maxLevel = parseInt(process.env.MAX_COMMISSION_LEVELS || '5', 10);

    const buyerNode = await this.networkNodeRepo.findOne({ where: { user_id: payload.buyer_id } });
    if (!buyerNode) {
      this.logger.warn(`Buyer ${payload.buyer_id} (Order ${payload.order_id}) has no network node. Marking outbox ${outboxEvent.id} as published but no commissions generated.`);
      await this.outboxRepo.update({ id: outboxEvent.id }, { published: true, published_at: new Date() });
      return;
    }

    // Parse upline_path — handles both JSON string (SQLite) and array (PostgreSQL)
    const uplinePath: string[] = typeof buyerNode.upline_path === 'string'
      ? JSON.parse(buyerNode.upline_path as any)
      : (buyerNode.upline_path as string[]);

    if (!uplinePath.length) {
      await this.outboxRepo.update({ id: outboxEvent.id }, { published: true, published_at: new Date() });
      return;
    }

    await this.dataSource.transaction(async (em) => {
      for (let level = 1; level <= Math.min(uplinePath.length, maxLevel); level++) {
        const beneficiaryId = uplinePath[uplinePath.length - level];

        // Self-purchase guard
        if (beneficiaryId === payload.buyer_id) continue;

        const rule = rulesByLevel.get(level);
        if (!rule) continue;

        // min_order_value check
        if (Number(rule.min_order_value) > 0 &&
            Number(payload.total_amount) < Number(rule.min_order_value)) continue;

        // Qualification check — use em.findOne (not injected repo) to stay in transaction
        const qualState = await em.findOne(QualificationState, { where: { user_id: beneficiaryId } });
        if (!qualState?.is_qualified) continue;

        const rawAmount = Number(payload.total_amount) * Number(rule.percentage);
        const cappedAmount = rule.cap_per_order
          ? Math.min(rawAmount, Number(rule.cap_per_order))
          : rawAmount;
        const calculatedAmount = parseFloat(cappedAmount.toFixed(2));
        if (calculatedAmount <= 0) continue;

        const idempotencyKey = `order:${payload.order_id}:level:${level}:user:${beneficiaryId}`;
        const now = new Date();
        const availableAfter = new Date(now.getTime() + Number(rule.payout_delay_days) * 86400000);
        const clawbackBefore = new Date(availableAfter.getTime() + Number(rule.clawback_window_days) * 86400000);

        let commissionEvent: CommissionEvent;
        try {
          commissionEvent = em.create(CommissionEvent, {
            order_id: payload.order_id,
            beneficiary_id: beneficiaryId,
            commission_level: level,
            policy_version_id: policy.id,
            rule_id: rule.id,
            calculated_amount: calculatedAmount,
            currency: payload.currency || process.env.DEFAULT_CURRENCY || 'INR',
            status: 'pending',
            available_after: availableAfter,
            clawback_before: clawbackBefore,
            idempotency_key: idempotencyKey,
          });
          commissionEvent = await em.save(CommissionEvent, commissionEvent);
        } catch (err: any) {
          if (err?.code === '23505' || err?.message?.includes('UNIQUE constraint failed')) {
            this.logger.debug(`Commission already exists for ${idempotencyKey} — skipping`);
            continue;
          }
          throw err;
        }

        await em.save(CommissionEventSource, em.create(CommissionEventSource, {
          commission_event_id: commissionEvent.id,
          outbox_event_id: outboxEvent.id,
          order_id: payload.order_id,
          buyer_id: payload.buyer_id,
          total_amount: Number(payload.total_amount),
          currency: payload.currency || 'INR',
        }));

        await this.ledgerService.writeEntry({
          userId: beneficiaryId,
          entryType: LedgerEntryType.COMMISSION_PENDING,
          amount: calculatedAmount,
          currency: payload.currency || 'INR',
          status: LedgerEntryStatus.PENDING,
          referenceId: commissionEvent.id,
          referenceType: 'commission_event',
          note: `L${level} commission from order ${payload.order_id}`,
        }, em);
      }

      // Mark outbox published in same transaction
      await em.update(MoneyEventOutbox, { id: outboxEvent.id }, {
        published: true,
        published_at: new Date(),
      });
    });
  }

  async processUnpublishedEvents(): Promise<{ processed: number; skipped: number; errors: number }> {
    const batchSize = parseInt(process.env.COMMISSION_CALC_BATCH_SIZE || '50', 10);
    const events = await this.outboxRepo.find({
      where: { event_type: 'order.paid', published: false },
      order: { created_at: 'ASC' },
      take: batchSize,
    });

    let processed = 0, skipped = 0, errors = 0;
    for (const event of events) {
      try {
        await this.processOutboxEvent(event);
        processed++;
      } catch (err) {
        this.logger.error(`Failed to process outbox event ${event.id}:`, err);
        errors++;
      }
    }
    return { processed, skipped, errors };
  }
}
