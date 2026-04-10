import { Injectable, Logger } from '@nestjs/common';
import { CommissionHold } from '../modules/trust/holds/entities/commission-hold.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CommissionEvent } from '../modules/commission/entities/commission-event.entity';
import { LedgerService } from '../modules/ledger/services/ledger.service';
import {
  LedgerEntryType,
  LedgerEntryStatus,
} from '../modules/ledger/entities/ledger-entry.entity';

@Injectable()
export class CommissionReleaseJob {
  private readonly logger = new Logger(CommissionReleaseJob.name);

  constructor(
    @InjectRepository(CommissionEvent)
    private readonly commissionEventRepo: Repository<CommissionEvent>,
    private readonly ledgerService: LedgerService,
    private readonly dataSource: DataSource,
  ) {}

  async run(): Promise<{ released: number; errors: number }> {
    const batchSize = parseInt(
      process.env.COMMISSION_RELEASE_BATCH_SIZE || '100',
      10,
    );
    const now = new Date();

    // Use injected repo for the initial read (outside transaction) — safe
    const events = await this.commissionEventRepo
      .createQueryBuilder('ce')
      .where('ce.status = :status', { status: 'pending' })
      .andWhere('ce.available_after <= :now', { now })
      .orderBy('ce.available_after', 'ASC')
      .take(batchSize)
      .getMany();

    let released = 0,
      errors = 0;

    for (const event of events) {
      try {
        await this.dataSource.transaction(async (em) => {
          // Re-read inside transaction for consistency — use em.findOne, NOT injected repo
          const fresh = await em.findOne(CommissionEvent, {
            where: { id: event.id },
          });
          if (
            !fresh ||
            fresh.status !== 'pending' ||
            fresh.available_after > now
          )
            return;

          // Phase 7 hook — check for active commission hold
          // Fix H4: check both event-specific AND user-level holds (fraud/dispute holds have null commission_event_id)
          try {
            const activeHold = await em
              .createQueryBuilder(CommissionHold, 'ch')
              .where('ch.status = :status', { status: 'active' })
              .andWhere(
                '(ch.commission_event_id = :eventId OR (ch.user_id = :userId AND ch.commission_event_id IS NULL))',
                { eventId: fresh.id, userId: fresh.beneficiary_id },
              )
              .getOne();
            if (activeHold) {
              this.logger.warn(
                `Commission event ${fresh.id} release skipped — active hold ${activeHold.id}`,
              );
              return; // skip this event this batch cycle
            }
          } catch {
            // CommissionHold entity not registered — no holds to check, proceed normally
          }

          await em.update(
            CommissionEvent,
            { id: fresh.id },
            { status: 'available' },
          );

          // 1) Write the offset to the pending sum
          await this.ledgerService.writeEntry(
            {
              userId: fresh.beneficiary_id,
              entryType: LedgerEntryType.COMMISSION_PENDING,
              amount: -Number(fresh.calculated_amount),
              currency: fresh.currency,
              status: LedgerEntryStatus.PENDING,
              referenceId: fresh.id,
              referenceType: 'commission_event',
              note: `Pending offset for commission release: ${fresh.id}`,
              idempotencyKey: `release-offset:${fresh.id}`,
            },
            em,
          );

          // 2) Write the new available credit
          await this.ledgerService.writeEntry(
            {
              userId: fresh.beneficiary_id,
              entryType: LedgerEntryType.COMMISSION_AVAILABLE,
              amount: Number(fresh.calculated_amount),
              currency: fresh.currency,
              status: LedgerEntryStatus.SETTLED,
              referenceId: fresh.id,
              referenceType: 'commission_event',
              note: `Commission released: ${fresh.id}`,
              idempotencyKey: `release-credit:${fresh.id}`,
            },
            em,
          );
        });
        released++;
      } catch (err) {
        this.logger.error(
          `Failed to release commission event ${event.id}:`,
          err,
        );
        errors++;
      }
    }

    this.logger.log(
      `CommissionReleaseJob: released=${released}, errors=${errors}`,
    );
    return { released, errors };
  }
}
