import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ResolutionEvent } from '../holds/entities/resolution-event.entity';
import { ReturnRequest } from '../returns/entities/return-request.entity';
import { Dispute } from '../disputes/entities/dispute.entity';
import { Order } from '../../order/entities/order.entity';
import { ClawbackJob } from '../../../jobs/clawback.job';
import { TrustAuditService } from '../audit/services/trust-audit.service';

@Injectable()
export class HoldPropagationJob {
  private readonly logger = new Logger(HoldPropagationJob.name);

  constructor(
    @InjectRepository(ResolutionEvent)
    private readonly resolutionEventRepo: Repository<ResolutionEvent>,
    @InjectRepository(ReturnRequest)
    private readonly returnRequestRepo: Repository<ReturnRequest>,
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    private readonly clawbackJob: ClawbackJob,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async run(): Promise<void> {
    // Find clawback_triggered resolution events
    const events = await this.resolutionEventRepo.find({
      where: { resolution_type: 'clawback_triggered' },
    });

    for (const event of events) {
      try {
        // Find the related order_id
        let orderId: string | null = null;

        if (event.entity_type === 'return_request') {
          const ret = await this.returnRequestRepo.findOne({ where: { id: event.entity_id } });
          if (ret) orderId = ret.order_id;
        } else if (event.entity_type === 'dispute') {
          const dispute = await this.disputeRepo.findOne({ where: { id: event.entity_id } });
          if (dispute) orderId = dispute.order_id;
        }

        if (!orderId) {
          this.logger.warn(`HoldPropagationJob: Could not determine order_id for event ${event.id}`);
          continue;
        }

        // Call ClawbackJob — it's already idempotent (events skip if already clawed back)
        const result = await this.clawbackJob.clawbackForOrder(orderId);
        this.logger.log(
          `HoldPropagationJob: Processed event ${event.id} for order ${orderId}: ` +
          `clawedBack=${result.clawedBack}, skipped=${result.skipped}`,
        );

        await this.auditService.log({
          actorId: null,
          actorType: 'system',
          action: 'hold_propagation.clawback_executed',
          entityType: event.entity_type,
          entityId: event.entity_id,
          metadata: { order_id: orderId, ...result },
        });

      } catch (err) {
        this.logger.error(`HoldPropagationJob: Failed to process event ${event.id}:`, err);
      }
    }

    this.logger.log('HoldPropagationJob: completed');
  }
}
