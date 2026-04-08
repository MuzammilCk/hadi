import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommissionEvent } from '../modules/commission/entities/commission-event.entity';
import { LedgerService } from '../modules/ledger/services/ledger.service';
import { LedgerEntryType, LedgerEntryStatus } from '../modules/ledger/entities/ledger-entry.entity';

@Injectable()
export class ClawbackJob {
  private readonly logger = new Logger(ClawbackJob.name);

  constructor(
    @InjectRepository(CommissionEvent)
    private readonly commissionEventRepo: Repository<CommissionEvent>,
    private readonly ledgerService: LedgerService,
    private readonly dataSource: DataSource,
  ) {}

  async clawbackForOrder(orderId: string): Promise<{ clawedBack: number; skipped: number }> {
    const now = new Date();
    const events = await this.commissionEventRepo.find({ where: { order_id: orderId } });
    let clawedBack = 0, skipped = 0;

    for (const event of events) {
      if (['paid', 'clawed_back', 'voided'].includes(event.status)) { skipped++; continue; }
      if (event.status === 'available' && event.clawback_before < now) {
        this.logger.warn(`Commission event ${event.id} past clawback window — skipping`);
        skipped++; continue;
      }

      try {
        await this.dataSource.transaction(async (em) => {
          const fresh = await em.findOne(CommissionEvent, { where: { id: event.id } });
          if (!fresh || ['clawed_back', 'voided'].includes(fresh.status)) return;

          const entryType = fresh.status === 'pending'
            ? LedgerEntryType.COMMISSION_REVERSED
            : LedgerEntryType.CLAWBACK;

          await em.update(CommissionEvent, { id: fresh.id }, { status: 'clawed_back' });

          // Fix #7: idempotency key prevents duplicate debit on admin retry
          await this.ledgerService.writeEntry({
            userId: fresh.beneficiary_id,
            entryType,
            amount: -Math.abs(Number(fresh.calculated_amount)),  // NEGATIVE = debit
            currency: fresh.currency,
            status: LedgerEntryStatus.REVERSED,
            referenceId: fresh.id,
            referenceType: 'commission_event',
            note: `Clawback for order ${orderId}`,
            idempotencyKey: `clawback:${fresh.id}`,
          }, em);
        });
        clawedBack++;
      } catch (err) {
        this.logger.error(`Failed to claw back commission event ${event.id}:`, err);
        // Fix #4: count as skipped, do NOT rethrow — one failed event must not
        // abort processing of remaining events in this order's commission set.
        skipped++;
      }
    }
    return { clawedBack, skipped };
  }
}
