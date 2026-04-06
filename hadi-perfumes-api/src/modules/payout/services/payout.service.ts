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

      // Balance check
      const available = await this.ledgerService.getAvailableBalance(userId);
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

      return saved;
    });
  }

  async approvePayoutRequest(payoutId: string, adminActorId: string): Promise<PayoutRequest> {
    return this.dataSource.transaction(async (em) => {
      const request = await em.findOne(PayoutRequest, { where: { id: payoutId } });
      if (!request) throw new PayoutRequestNotFoundException(payoutId);
      if (request.status !== PayoutRequestStatus.REQUESTED) {
        throw new PayoutNotApprovableException(request.status);
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
      await this.ledgerService.writeEntry({
        userId: request.user_id,
        entryType: LedgerEntryType.PAYOUT_FAILED,
        amount: Math.abs(Number(request.amount)),  // positive = credit reversal
        currency: request.currency,
        status: LedgerEntryStatus.SETTLED,
        referenceId: request.id,
        referenceType: 'payout_request',
        note: `Payout rejected: ${reason}`,
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
   * Phase 6 stub: processes approved requests without real bank transfer.
   * Phase 8 replaces this with real provider integration.
   */
  async executeBatch(adminActorId: string): Promise<PayoutBatch> {
    const approvedRequests = await this.payoutRequestRepo.find({
      where: { status: PayoutRequestStatus.APPROVED },
    });
    if (!approvedRequests.length) {
      throw new BadRequestException('No approved payout requests to batch');
    }

    return this.dataSource.transaction(async (em) => {
      const totalAmount = approvedRequests.reduce((sum, r) => sum + Number(r.amount), 0);
      const savedBatch = await em.save(PayoutBatch, em.create(PayoutBatch, {
        status: PayoutBatchStatus.PROCESSING,
        total_amount: parseFloat(totalAmount.toFixed(2)),
        currency: process.env.DEFAULT_CURRENCY || 'INR',
        request_count: approvedRequests.length,
        initiated_by: adminActorId,
        started_at: new Date(),
      }));

      let processedCount = 0, failedCount = 0;

      for (const request of approvedRequests) {
        try {
          await em.update(PayoutRequest, { id: request.id }, {
            status: PayoutRequestStatus.SENT,
            batch_id: savedBatch.id,
          });
          await this.ledgerService.writeEntry({
            userId: request.user_id,
            entryType: LedgerEntryType.PAYOUT_SENT,
            amount: -Math.abs(Number(request.amount)),
            currency: request.currency,
            status: LedgerEntryStatus.SETTLED,
            referenceId: request.id,
            referenceType: 'payout_request',
            note: `Payout sent (batch ${savedBatch.id})`,
          }, em);
          processedCount++;
        } catch (err) {
          this.logger.error(`Failed payout request ${request.id}:`, err);
          await em.update(PayoutRequest, { id: request.id }, {
            status: PayoutRequestStatus.FAILED,
            failure_reason: err instanceof Error ? err.message : String(err),
          });
          
          await this.ledgerService.writeEntry({
            userId: request.user_id,
            entryType: LedgerEntryType.PAYOUT_FAILED,
            amount: Math.abs(Number(request.amount)), // positive reversal credit
            currency: request.currency,
            status: LedgerEntryStatus.SETTLED,
            referenceId: request.id,
            referenceType: 'payout_request',
            note: `Payout failed — balance restored (batch ${savedBatch.id})`,
            idempotencyKey: `payout-failed:${request.id}`,
          }, em);
          
          failedCount++;
        }
      }

      await em.update(PayoutBatch, { id: savedBatch.id }, {
        status: failedCount > 0 ? PayoutBatchStatus.FAILED : PayoutBatchStatus.COMPLETED,
        processed_count: processedCount,
        failed_count: failedCount,
        completed_at: new Date(),
      });

      const result = await em.findOne(PayoutBatch, { where: { id: savedBatch.id } });
      return result!;
    });
  }
}
