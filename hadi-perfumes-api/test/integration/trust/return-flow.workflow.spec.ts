jest.setTimeout(30000);

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { User } from '../../../src/modules/user/entities/user.entity';
import {
  Order,
  OrderStatus,
} from '../../../src/modules/order/entities/order.entity';
import {
  ReturnRequest,
  ReturnRequestStatus,
  ReturnReasonCode,
} from '../../../src/modules/trust/returns/entities/return-request.entity';
import { ReturnItem } from '../../../src/modules/trust/returns/entities/return-item.entity';
import { ReturnStatusHistory } from '../../../src/modules/trust/returns/entities/return-status-history.entity';
import { ReturnEvidence } from '../../../src/modules/trust/returns/entities/return-evidence.entity';
import { ResolutionEvent } from '../../../src/modules/trust/holds/entities/resolution-event.entity';
import { TrustAuditLog } from '../../../src/modules/trust/audit/entities/trust-audit-log.entity';

import { ReturnService } from '../../../src/modules/trust/returns/services/return.service';
import { ReturnEligibilityJob } from '../../../src/modules/trust/jobs/return-eligibility.job';
import { ClawbackJob } from '../../../src/jobs/clawback.job';
import { TrustAuditService } from '../../../src/modules/trust/audit/services/trust-audit.service';
import {
  ReturnIneligibleException,
  ReturnWindowExpiredException,
} from '../../../src/modules/trust/returns/exceptions/return.exceptions';

// Minimal mock for ClawbackJob dependency
const mockClawbackJob = {
  clawbackForOrder: jest
    .fn()
    .mockResolvedValue({ processed: 1, skipped: 0, errors: 0 }),
};

describe('Return Flow Workflow (Integration)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let returnService: ReturnService;
  let returnJob: ReturnEligibilityJob;

  let userRepo: Repository<User>;
  let orderRepo: Repository<Order>;
  let returnRepo: Repository<ReturnRequest>;
  let resolutionRepo: Repository<ResolutionEvent>;

  let buyer: User;
  let orderValid: Order;
  let orderExpired: Order;
  let orderOtherBuyer: Order;
  const adminId = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [__dirname + '/../../../src/**/*.entity{.ts,.js}'],
        }),
        TypeOrmModule.forFeature([
          User,
          Order,
          ReturnRequest,
          ReturnItem,
          ReturnStatusHistory,
          ReturnEvidence,
          ResolutionEvent,
          TrustAuditLog,
        ]),
      ],
      providers: [
        ReturnService,
        TrustAuditService,
        ReturnEligibilityJob,
        { provide: ClawbackJob, useValue: mockClawbackJob },
      ],
    }).compile();

    dataSource = module.get(DataSource);
    returnService = module.get(ReturnService);
    returnJob = module.get(ReturnEligibilityJob);

    userRepo = dataSource.getRepository(User);
    orderRepo = dataSource.getRepository(Order);
    returnRepo = dataSource.getRepository(ReturnRequest);
    resolutionRepo = dataSource.getRepository(ResolutionEvent);

    buyer = await userRepo.save(
      userRepo.create({ phone: '+919999990001', status: 'active' }),
    );
    const otherBuyer = await userRepo.save(
      userRepo.create({ phone: '+919999990002', status: 'active' }),
    );

    orderValid = await orderRepo.save(
      orderRepo.create({
        buyer_id: buyer.id,
        subtotal: 100,
        total_amount: 100,
        currency: 'INR',
        status: OrderStatus.DELIVERED,
        idempotency_key: uuidv4(),
        completed_at: new Date(),
      }),
    );

    orderOtherBuyer = await orderRepo.save(
      orderRepo.create({
        buyer_id: otherBuyer.id,
        subtotal: 100,
        total_amount: 100,
        currency: 'INR',
        status: OrderStatus.DELIVERED,
        idempotency_key: uuidv4(),
        completed_at: new Date(),
      }),
    );

    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 31); // Past 30 day window
    orderExpired = await orderRepo.save(
      orderRepo.create({
        buyer_id: buyer.id,
        subtotal: 100,
        total_amount: 100,
        currency: 'INR',
        status: OrderStatus.COMPLETED,
        idempotency_key: uuidv4(),
        completed_at: expiredDate,
      }),
    );
  });

  afterAll(async () => {
    await module?.close();
  });

  it('buyer creates return for delivered order → status=pending_review', async () => {
    const returnReq = await returnService.createReturn(
      buyer.id,
      {
        order_id: orderValid.id,
        reason_code: ReturnReasonCode.DEFECTIVE,
        idempotency_key: uuidv4(),
      },
      uuidv4(),
    );

    expect(returnReq).toBeDefined();
    expect(returnReq.status).toBe(ReturnRequestStatus.PENDING_REVIEW);
    expect(returnReq.buyer_id).toBe(buyer.id);
  });

  it('admin approves return → status=approved', async () => {
    const ret = await returnRepo.findOne({
      where: { order_id: orderValid.id },
    });
    const approved = await returnService.approveReturn(
      ret!.id,
      adminId,
      'Approved',
    );
    expect(approved.status).toBe(ReturnRequestStatus.APPROVED);
    expect(approved.decided_by).toBe(adminId);
  });

  it('admin completes return → ResolutionEvent(clawback_triggered) written', async () => {
    const ret = await returnRepo.findOne({
      where: { order_id: orderValid.id },
    });
    const completed = await returnService.completeReturn(
      ret!.id,
      adminId,
      'Completed',
    );
    expect(completed.status).toBe(ReturnRequestStatus.COMPLETED);
    expect(completed.clawback_triggered).toBe(true);
    expect(completed.refund_triggered).toBe(true);

    const resolution = await resolutionRepo.findOne({
      where: { entity_id: ret!.id, resolution_type: 'clawback_triggered' },
    });
    expect(resolution).toBeDefined();
  });

  it('ReturnEligibilityJob picks up approved return → calls ClawbackJob', async () => {
    // Create another return, approve it, and let job process it
    const orderForJob = await orderRepo.save(
      orderRepo.create({
        buyer_id: buyer.id,
        subtotal: 100,
        total_amount: 100,
        currency: 'INR',
        status: OrderStatus.DELIVERED,
        idempotency_key: uuidv4(),
        completed_at: new Date(),
      }),
    );

    const ret = await returnService.createReturn(
      buyer.id,
      {
        order_id: orderForJob.id,
        reason_code: ReturnReasonCode.WRONG_ITEM,
        idempotency_key: uuidv4(),
      },
      uuidv4(),
    );

    await returnService.approveReturn(ret.id, adminId, 'approve for job');

    // Process job
    const result = await returnJob.processApproved();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    // Check it created ResolutionEvent
    const resEvent = await resolutionRepo.findOne({
      where: { entity_id: ret.id, resolution_type: 'clawback_triggered' },
    });
    expect(resEvent).toBeDefined();

    // Verify clawback_triggered is now true
    const updated = await returnRepo.findOne({ where: { id: ret.id } });
    expect(updated!.clawback_triggered).toBe(true);
  });

  it('clawback idempotent: running job twice produces same result', async () => {
    // job should not re-process because refund_triggered and clawback_triggered are true
    const result = await returnJob.processApproved();
    expect(result.processed).toBe(0);
  });

  it('order outside return window → ReturnWindowExpiredException', async () => {
    await expect(
      returnService.createReturn(
        buyer.id,
        {
          order_id: orderExpired.id,
          reason_code: ReturnReasonCode.DAMAGED,
          idempotency_key: uuidv4(),
        },
        uuidv4(),
      ),
    ).rejects.toThrow(ReturnWindowExpiredException);
  });

  it('non-owned order → ReturnIneligibleException', async () => {
    await expect(
      returnService.createReturn(
        buyer.id,
        {
          order_id: orderOtherBuyer.id,
          reason_code: ReturnReasonCode.OTHER,
          idempotency_key: uuidv4(),
        },
        uuidv4(),
      ),
    ).rejects.toThrow(ReturnIneligibleException);
  });
});
