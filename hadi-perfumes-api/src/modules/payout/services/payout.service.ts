import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PayoutRequest, PayoutRequestStatus } from '../entities/payout-request.entity';
import { PayoutBatch, PayoutBatchStatus } from '../entities/payout-batch.entity';
import { User } from '../../user/entities/user.entity';
import { QualificationState } from '../../network/entities/qualification-state.entity';
import { LedgerService } from '../../ledger/services/ledger.service';
import { WalletService } from '../../ledger/services/wallet.service';
import { LedgerEntryType, LedgerEntryStatus } from '../../ledger/entities/ledger-entry.entity';
import { CreatePayoutRequestDto } from '../dto/create-payout-request.dto';
import { PayoutQueryDto } from '../dto/payout-query.dto';
import {
  BelowMinimumPayoutAmountException,
  InsufficientBalanceForPayoutException,
  PayoutBatchNotFoundException,
  PayoutNotApprovableException,
  PayoutNotRejectableException,
  PayoutRequestNotFoundException,
  PendingPayoutAlreadyExistsException,
  UserNotEligibleForPayoutException,
} from '../exceptions/payout.exceptions';

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    @InjectRepository(PayoutRequest) private payoutRequestRepo: Repository<PayoutRequest>,
    @InjectRepository(PayoutBatch) private payoutBatchRepo: Repository<PayoutBatch>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(QualificationState) private qualStateRepo: Repository<QualificationState>,
    private readonly ledgerService: LedgerService,
    private readonly walletService: WalletService,
    private readonly dataSource: DataSource,
  ) {}

  async createPayoutRequest(
    userId: string,
    dto: CreatePayoutRequestDto,
    idempotencyKey: string,
  ): Promise<PayoutRequest> {
    // Idempotency check (outside transaction — read-only)
    const existing = await this.payoutRequestRepo.findOne({ where: { idempotency_key: idempotencyKey } });
    if (existing) return existing;

    const minPayout = parseFloat(process.env.MIN_PAYOUT_AMOUNT_INR || '100');
    if (dto.amount < minPayout) throw new BelowMinimumPayoutAmountException(minPayout);

    return this.dataSource.transaction(async (em) => {
      const user = await em.findOne(User, { where: { id: userId } });
      if (!user || user.status !== 'active') {
        throw new UserNotEligibleForPayoutException('user is not active');
      }

      const qualState = await em.findOne(QualificationState, { where: { user_id: userId } });
      if (!qualState?.is_qualified) {
        throw new UserNotEligibleForPayoutException('user is not qualified');
      }

      // Check for existing pending or approved payout
      const pending = await em.findOne(PayoutRequest, {
        where: [
          { user_id: userId, status: PayoutRequestStatus.REQUESTED },
          { user_id: userId, status: PayoutRequestStatus.APPROVED },
        ],
      });
      if (pending) throw new PendingPayoutAlreadyExistsException();

      // Balance check inside transaction using em so it participates in the lock (Fix #2b)
      const available = await this.ledgerService.getAvailableBalanceForManager(userId, em);
      if (available < dto.amount) throw new InsufficientBalanceForPayoutException(available, dto.amount);

      const saved = await em.save(PayoutRequest, em.create(PayoutRequest, {
        user_id: userId,
        amount: parseFloat(dto.amount.toFixed(2)),
        currency: process.env.DEFAULT_CURRENCY || 'INR',
        status: PayoutRequestStatus.REQUESTED,
        idempotency_key: idempotencyKey,
        payout_method: dto.payout_method ?? null,
      }));

      const ledgerEntry = await this.ledgerService.writeEntry({
        userId,
        entryType: LedgerEntryType.PAYOUT_REQUESTED,
        amount: -Math.abs(dto.amount),  // negative = debit/hold
        currency: process.env.DEFAULT_CURRENCY || 'INR',
        status: LedgerEntryStatus.HELD,
        referenceId: saved.id,
        referenceType: 'payout_request',
        note: `Payout request ${saved.id}`,
        idempotencyKey: `payout-requested:${saved.id}`,
      }, em);

      await em.update(PayoutRequest, { id: saved.id }, { ledger_entry_id: ledgerEntry.id });

      // Fix #9: re-fetch so the returned object reflects updated ledger_entry_id
      const updated = await em.findOne(PayoutRequest, { where: { id: saved.id } });
      return updated!;
    });
  }

  async approvePayoutRequest(payoutId: string, adminActorId: string): Promise<PayoutRequest> {
    return this.dataSource.transaction(async (em) => {
      const request = await em.findOne(PayoutRequest, { where: { id: payoutId } });
      if (!request) throw new PayoutRequestNotFoundException(payoutId);
      if (request.status !== PayoutRequestStatus.REQUESTED) {
        throw new PayoutNotApprovableException(request.status);
      }

      // Fix #10: Re-verify balance at approval time — clawbacks since request can reduce it
      const currentBalance = await this.ledgerService.getAvailableBalanceForManager(
        request.user_id, em,
      );
      if (currentBalance < Number(request.amount)) {
        throw new InsufficientBalanceForPayoutException(currentBalance, Number(request.amount));
      }

      request.status = PayoutRequestStatus.APPROVED;
      request.approved_by = adminActorId;
      request.approved_at = new Date();
      return em.save(PayoutRequest, request);
    });
  }

  async rejectPayoutRequest(payoutId: string, adminActorId: string, reason: string): Promise<PayoutRequest> {
    return this.dataSource.transaction(async (em) => {
      const request = await em.findOne(PayoutRequest, { where: { id: payoutId } });
      if (!request) throw new PayoutRequestNotFoundException(payoutId);
      if (request.status !== PayoutRequestStatus.REQUESTED) {
        throw new PayoutNotRejectableException(request.status);
      }
      request.status = PayoutRequestStatus.REJECTED;
      request.rejected_by = adminActorId;
      request.rejected_at = new Date();
      request.rejection_reason = reason;
      await em.save(PayoutRequest, request);

      // Reverse the held ledger debit (positive credit to restore balance)
      // Fix #6: idempotency key prevents duplicate credit on transaction retry
      await this.ledgerService.writeEntry({
        userId: request.user_id,
        entryType: LedgerEntryType.PAYOUT_FAILED,
        amount: Math.abs(Number(request.amount)),  // positive = credit reversal
        currency: request.currency,
        status: LedgerEntryStatus.SETTLED,
        referenceId: request.id,
        referenceType: 'payout_request',
        note: `Payout rejected: ${reason}`,
        idempotencyKey: `payout-rejected:${request.id}`,
      }, em);

      return request;
    });
  }

  async getPayoutRequest(payoutId: string): Promise<PayoutRequest> {
    const request = await this.payoutRequestRepo.findOne({ where: { id: payoutId } });
    if (!request) throw new PayoutRequestNotFoundException(payoutId);
    return request;
  }

  async listBatches(
    query: { page?: number; limit?: number } = {},
  ): Promise<{ data: PayoutBatch[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const [data, total] = await this.payoutBatchRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async adminListPayouts(query: PayoutQueryDto): Promise<{
    data: PayoutRequest[]; total: number; page: number; limit: number;
  }> {
    const qb = this.payoutRequestRepo.createQueryBuilder('pr').where('1=1');
    if (query.status) qb.andWhere('pr.status = :status', { status: query.status });
    if (query.user_id) qb.andWhere('pr.user_id = :userId', { userId: query.user_id });
    qb.orderBy('pr.created_at', 'DESC')
      .skip(((query.page || 1) - 1) * (query.limit || 20))
      .take(query.limit || 20);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page || 1, limit: query.limit || 20 };
  }

  async listUserPayouts(userId: string, query: PayoutQueryDto): Promise<{
    data: PayoutRequest[]; total: number; page: number; limit: number;
  }> {
    const qb = this.payoutRequestRepo.createQueryBuilder('pr')
      .where('pr.user_id = :userId', { userId });
    if (query.status) qb.andWhere('pr.status = :status', { status: query.status });
    qb.orderBy('pr.created_at', 'DESC')
      .skip(((query.page || 1) - 1) * (query.limit || 20))
      .take(query.limit || 20);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page || 1, limit: query.limit || 20 };
  }

  /**
   * Fix C3: each payout request runs in its OWN independent transaction.
   * PostgreSQL aborts the entire transaction on any error — the old single-tx approach meant
   * the catch block's em.update calls silently failed on the already-aborted em.
   * Now: lock → batch create → per-request tx → recovery tx → batch update are all separate.
   */
  async executeBatch(adminActorId: string): Promise<PayoutBatch> {
    // Step 1: Acquire row-level lock on APPROVED requests inside a short transaction
    const approvedRequests = await this.dataSource.transaction(async (em) => {
      const qb = em
        .createQueryBuilder(PayoutRequest, 'pr')
        .where('pr.status = :status', { status: PayoutRequestStatus.APPROVED });
      if (process.env.NODE_ENV !== 'test') {
        qb.setLock('pessimistic_write_or_fail');
      }
      return qb.getMany();
    });

    if (!approvedRequests.length) {
      throw new BadRequestException('No approved payout requests to batch');
    }

    // Step 2: Create the batch record
    const totalAmount = approvedRequests.reduce((sum, r) => sum + Number(r.amount), 0);
    const savedBatch = await this.dataSource.transaction(async (em) =>
      em.save(PayoutBatch, em.create(PayoutBatch, {
        status: PayoutBatchStatus.PROCESSING,
        total_amount: parseFloat(totalAmount.toFixed(2)),
        currency: process.env.DEFAULT_CURRENCY || 'INR',
        request_count: approvedRequests.length,
        initiated_by: adminActorId,
        started_at: new Date(),
      })),
    );

    let processedCount = 0, failedCount = 0;

    // Step 3: Each payout request in its OWN clean transaction
    for (const request of approvedRequests) {
      try {
        await this.dataSource.transaction(async (em) => {
          // Re-read inside tx to guard against concurrent batch runs
          const fresh = await em.findOne(PayoutRequest, { where: { id: request.id } });
          if (!fresh || fresh.status !== PayoutRequestStatus.APPROVED) return;

          await em.update(PayoutRequest, { id: request.id }, {
            status: PayoutRequestStatus.SENT,
            batch_id: savedBatch.id,
          });

          // Fix #5 retained: idempotency key prevents duplicate debit on retry
          await this.ledgerService.writeEntry({
            userId: request.user_id,
            entryType: LedgerEntryType.PAYOUT_SENT,
            amount: -Math.abs(Number(request.amount)),
            currency: request.currency,
            status: LedgerEntryStatus.SETTLED,
            referenceId: request.id,
            referenceType: 'payout_request',
            note: `Payout sent (batch ${savedBatch.id})`,
            idempotencyKey: `payout-sent:${request.id}`,
          }, em);
        });
        processedCount++;
      } catch (err) {
        this.logger.error(`Failed payout request ${request.id}:`, err);
        // Recovery in a fresh, clean transaction — the failed tx is already gone
        await this.dataSource.transaction(async (em) => {
          await em.update(PayoutRequest, { id: request.id }, {
            status: PayoutRequestStatus.FAILED,
            failure_reason: err instanceof Error ? err.message : String(err),
          });
          await this.ledgerService.writeEntry({
            userId: request.user_id,
            entryType: LedgerEntryType.PAYOUT_FAILED,
            amount: Math.abs(Number(request.amount)),
            currency: request.currency,
            status: LedgerEntryStatus.SETTLED,
            referenceId: request.id,
            referenceType: 'payout_request',
            note: `Payout failed — balance restored (batch ${savedBatch.id})`,
            idempotencyKey: `payout-batch-failed:${request.id}`,
          }, em);
        }).catch((recoveryErr) => {
          // Recovery itself failed — log for manual intervention
          this.logger.error(
            `CRITICAL: recovery write failed for payout ${request.id}`,
            recoveryErr,
          );
        });
        failedCount++;
      }
    }

    // Step 4: Finalize batch status
    await this.dataSource.transaction(async (em) =>
      em.update(PayoutBatch, { id: savedBatch.id }, {
        status: failedCount > 0 ? PayoutBatchStatus.FAILED : PayoutBatchStatus.COMPLETED,
        processed_count: processedCount,
        failed_count: failedCount,
        completed_at: new Date(),
      }),
    );

    const result = await this.payoutBatchRepo.findOne({ where: { id: savedBatch.id } });
    return result!;
  }
}
