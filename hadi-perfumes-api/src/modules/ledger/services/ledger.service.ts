import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  LedgerEntry,
  LedgerEntryStatus,
  LedgerEntryType,
} from '../entities/ledger-entry.entity';
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
      amount: number; // positive = credit, negative = debit
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
    const idempotency_key =
      params.idempotencyKey ?? `${params.referenceId}:${params.entryType}`;

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
      if (
        err?.code === '23505' ||
        err?.message?.includes('UNIQUE constraint failed')
      ) {
        const existing = await manager.findOne(LedgerEntry, {
          where: { idempotency_key },
        });
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
      .andWhere('le.entry_type = :type', {
        type: LedgerEntryType.COMMISSION_PENDING,
      })
      .andWhere('le.status = :status', { status: LedgerEntryStatus.PENDING })
      .getRawOne<{ total: string }>();
    return parseFloat(result?.total ?? '0');
  }

  /**
   * Fix M4: single atomic SUM with CASE WHEN replaces two sequential SELECTs.
   * Under READ COMMITTED, a concurrent credit between two reads produced an incorrect snapshot.
   * FIXED: available_balance is now computed in one statement — no interleaving window.
   *
   * balance = sum of:
   *   + COMMISSION_AVAILABLE (settled) credits
   *   + PAYOUT_FAILED (settled) reversal credits
   *   + CLAWBACK (reversed) debits          (negative amounts)
   *   + COMMISSION_REVERSED (reversed) debits (negative amounts)
   *   + PAYOUT_REQUESTED (held) debits       (negative amounts)
   *   + PAYOUT_SENT (settled) debits         (negative amounts)
   */
  async getAvailableBalance(userId: string): Promise<number> {
    const result = await this.entryRepo
      .createQueryBuilder('le')
      .select(
        `COALESCE(SUM(CASE
          WHEN le.entry_type IN ('commission_available','payout_failed') AND le.status = 'settled'
            THEN CAST(le.amount AS DECIMAL)
          WHEN le.entry_type IN ('clawback','commission_reversed','payout_requested','payout_sent')
            AND le.status IN ('held','settled','reversed')
            THEN CAST(le.amount AS DECIMAL)
          ELSE 0
        END), 0)`,
        'balance',
      )
      .where('le.user_id = :userId', { userId })
      .getRawOne<{ balance: string }>();

    return parseFloat(result?.balance ?? '0');
  }

  /**
   * Fix #2 & M4: Same single-SELECT logic as getAvailableBalance but scoped to
   * the caller's EntityManager for TOCTOU-safe payout creation and approval.
   */
  async getAvailableBalanceForManager(
    userId: string,
    em: EntityManager,
  ): Promise<number> {
    const result = await em
      .createQueryBuilder(LedgerEntry, 'le')
      .select(
        `COALESCE(SUM(CASE
          WHEN le.entry_type IN ('commission_available','payout_failed') AND le.status = 'settled'
            THEN CAST(le.amount AS DECIMAL)
          WHEN le.entry_type IN ('clawback','commission_reversed','payout_requested','payout_sent')
            AND le.status IN ('held','settled','reversed')
            THEN CAST(le.amount AS DECIMAL)
          ELSE 0
        END), 0)`,
        'balance',
      )
      .where('le.user_id = :userId', { userId })
      .getRawOne<{ balance: string }>();

    return parseFloat(result?.balance ?? '0');
  }

  async getLedgerHistory(
    userId: string,
    query: {
      page: number;
      limit: number;
      entry_type?: string;
      status?: string;
    },
  ): Promise<{
    data: LedgerEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qb = this.entryRepo
      .createQueryBuilder('le')
      .where('le.user_id = :userId', { userId });

    if (query.entry_type)
      qb.andWhere('le.entry_type = :type', { type: query.entry_type });
    if (query.status)
      qb.andWhere('le.status = :status', { status: query.status });

    qb.orderBy('le.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit };
  }

  async adminGetLedgerEntries(query: {
    page: number;
    limit: number;
    user_id?: string;
    entry_type?: string;
  }): Promise<{
    data: LedgerEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qb = this.entryRepo.createQueryBuilder('le').where('1=1');
    if (query.user_id)
      qb.andWhere('le.user_id = :userId', { userId: query.user_id });
    if (query.entry_type)
      qb.andWhere('le.entry_type = :type', { type: query.entry_type });
    qb.orderBy('le.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, limit: query.limit };
  }
}
