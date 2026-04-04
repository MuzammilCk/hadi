import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { LedgerEntry, LedgerEntryStatus, LedgerEntryType } from '../entities/ledger-entry.entity';
import { LedgerQueryDto } from '../dto/ledger-query.dto';

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly entryRepo: Repository<LedgerEntry>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * The ONLY method that writes ledger entries.
   * Pass `em` to participate in caller's transaction (required for atomicity).
   * If `em` is omitted, uses the default repository manager (auto-commits).
   */
  async writeEntry(
    params: {
      userId: string;
      entryType: LedgerEntryType;
      amount: number;          // positive = credit, negative = debit
      currency: string;
      status: LedgerEntryStatus;
      referenceId: string;
      referenceType: string;
      reversalOfEntryId?: string;
      note?: string;
      idempotencyKey?: string;
    },
    em?: EntityManager,
  ): Promise<LedgerEntry> {
    const manager = em ?? this.entryRepo.manager;
    const idempotency_key = params.idempotencyKey ?? `${params.referenceId}:${params.entryType}`;
    
    const entry = manager.create(LedgerEntry, {
      user_id: params.userId,
      entry_type: params.entryType,
      amount: parseFloat(params.amount.toFixed(2)),
      currency: params.currency,
      status: params.status,
      reference_id: params.referenceId,
      reference_type: params.referenceType,
      reversal_of_entry_id: params.reversalOfEntryId ?? null,
      note: params.note ?? null,
      idempotency_key,
    });
    
    try {
      return await manager.save(LedgerEntry, entry);
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('UNIQUE constraint failed')) {
        const existing = await manager.findOne(LedgerEntry, { where: { idempotency_key } });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async getPendingBalance(userId: string): Promise<number> {
    const result = await this.entryRepo
      .createQueryBuilder('le')
      .select('COALESCE(SUM(CAST(le.amount AS DECIMAL)), 0)', 'total')
      .where('le.user_id = :userId', { userId })
      .andWhere('le.entry_type = :type', { type: LedgerEntryType.COMMISSION_PENDING })
      .andWhere('le.status = :status', { status: LedgerEntryStatus.PENDING })
      .getRawOne<{ total: string }>();
    return parseFloat(result?.total ?? '0');
  }

  /**
   * FIXED: includes HELD status for PAYOUT_REQUESTED so balance correctly reflects
   * held-but-not-yet-sent payout requests. Without this, user could double-request payouts.
   *
   * available_balance = credits (commission_available + payout_failed[settled])
   *                   - abs(debits)
   *
   * Debit types and their expected statuses:
   *   PAYOUT_REQUESTED → HELD   (money reserved, not yet processed)
   *   PAYOUT_SENT      → SETTLED (money sent)
   *   CLAWBACK         → REVERSED
   *   COMMISSION_REVERSED → REVERSED
   */
  async getAvailableBalance(userId: string): Promise<number> {
    // Credits
    const creditResult = await this.entryRepo
      .createQueryBuilder('le')
      .select('COALESCE(SUM(CAST(le.amount AS DECIMAL)), 0)', 'total')
      .where('le.user_id = :userId', { userId })
      .andWhere('le.entry_type IN (:...creditTypes)', {
        creditTypes: [LedgerEntryType.COMMISSION_AVAILABLE, LedgerEntryType.PAYOUT_FAILED],
      })
      .andWhere('le.status = :status', { status: LedgerEntryStatus.SETTLED })
      .getRawOne<{ total: string }>();
    const credits = parseFloat(creditResult?.total ?? '0');

    // Debits — include HELD for payout_requested, SETTLED for payout_sent, REVERSED for clawbacks
    const debitResult = await this.entryRepo
      .createQueryBuilder('le')
      .select('COALESCE(SUM(CAST(le.amount AS DECIMAL)), 0)', 'total')
      .where('le.user_id = :userId', { userId })
      .andWhere('le.entry_type IN (:...debitTypes)', {
        debitTypes: [
          LedgerEntryType.CLAWBACK,
          LedgerEntryType.COMMISSION_REVERSED,
          LedgerEntryType.PAYOUT_REQUESTED,
          LedgerEntryType.PAYOUT_SENT,
        ],
      })
      // Include HELD (payout_requested), SETTLED (payout_sent), REVERSED (clawbacks)
      .andWhere('le.status IN (:...statuses)', {
        statuses: [LedgerEntryStatus.HELD, LedgerEntryStatus.SETTLED, LedgerEntryStatus.REVERSED],
      })
      .getRawOne<{ total: string }>();
    // Debit amounts are stored as negative numbers; Math.abs converts to positive for subtraction
    const debits = Math.abs(parseFloat(debitResult?.total ?? '0'));

    return parseFloat((credits - debits).toFixed(2));
  }

  async getLedgerHistory(
    userId: string,
    query: { page: number; limit: number; entry_type?: string; status?: string },
  ): Promise<{ data: LedgerEntry[]; total: number; page: number; limit: number }> {
    const qb = this.entryRepo
      .createQueryBuilder('le')
      .where('le.user_id = :userId', { userId });

    if (query.entry_type) qb.andWhere('le.entry_type = :type', { type: query.entry_type });
    if (query.status) qb.andWhere('le.status = :status', { status: query.status });

    qb.orderBy('le.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit };
  }

  async adminGetLedgerEntries(query: {
    page: number; limit: number; user_id?: string; entry_type?: string;
  }): Promise<{ data: LedgerEntry[]; total: number; page: number; limit: number }> {
    const qb = this.entryRepo.createQueryBuilder('le').where('1=1');
    if (query.user_id) qb.andWhere('le.user_id = :userId', { userId: query.user_id });
    if (query.entry_type) qb.andWhere('le.entry_type = :type', { type: query.entry_type });
    qb.orderBy('le.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit };
  }
}
