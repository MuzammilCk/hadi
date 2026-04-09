import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReturnRequest, ReturnRequestStatus } from '../returns/entities/return-request.entity';
import { ResolutionEvent } from '../holds/entities/resolution-event.entity';
import { TrustAuditService } from '../audit/services/trust-audit.service';

@Injectable()
export class ReturnEligibilityJob {
  private readonly logger = new Logger(ReturnEligibilityJob.name);

  constructor(
    @InjectRepository(ReturnRequest)
    private readonly returnRequestRepo: Repository<ReturnRequest>,
    @InjectRepository(ResolutionEvent)
    private readonly resolutionEventRepo: Repository<ResolutionEvent>,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Process approved returns that haven't yet triggered clawback.
   * Write resolution events idempotently. Actual clawback is handled
   * by HoldPropagationJob or admin-triggered ClawbackJob.
   */
  async processApproved(): Promise<{ processed: number; errors: number }> {
    const approvedReturns = await this.returnRequestRepo.find({
      where: {
        status: ReturnRequestStatus.APPROVED,
        clawback_triggered: false,
      },
    });

    let processed = 0, errors = 0;

    for (const ret of approvedReturns) {
      try {
        await this.dataSource.transaction(async (em) => {
          const fresh = await em.findOne(ReturnRequest, { where: { id: ret.id } });
          if (!fresh || fresh.status !== ReturnRequestStatus.APPROVED || fresh.clawback_triggered) return;

          // Write clawback resolution event (idempotent via unique key)
          try {
            await em.save(ResolutionEvent, em.create(ResolutionEvent, {
              entity_type: 'return_request',
              entity_id: ret.id,
              resolution_type: 'clawback_triggered',
              actor_id: null,
              actor_type: 'system',
              note: `Return eligibility job: clawback triggered for return ${ret.id}`,
              idempotency_key: `return-eligibility-clawback:${ret.id}`,
            }));
          } catch (err: any) {
            if (!err?.message?.includes('UQ_resolution_events_idempotency_key') && !err?.message?.includes('UNIQUE constraint')) {
              throw err;
            }
          }

          await em.update(ReturnRequest, { id: ret.id }, { clawback_triggered: true });

          await this.auditService.log({
            actorId: null,
            actorType: 'system',
            action: 'return.clawback_triggered',
            entityType: 'return_request',
            entityId: ret.id,
          }, em);
        });
        processed++;
      } catch (err) {
        this.logger.error(`Failed to process return ${ret.id}:`, err);
        errors++;
      }
    }

    this.logger.log(`ReturnEligibilityJob: processed=${processed}, errors=${errors}`);
    return { processed, errors };
  }
}
