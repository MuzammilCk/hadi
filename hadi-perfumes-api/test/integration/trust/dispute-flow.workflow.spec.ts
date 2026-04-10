jest.setTimeout(30000);

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundException } from '@nestjs/common';

import { User } from '../../../src/modules/user/entities/user.entity';
import { Order, OrderStatus } from '../../../src/modules/order/entities/order.entity';
import { Dispute, DisputeStatus, DisputeResolution, DisputeReasonCode } from '../../../src/modules/trust/disputes/entities/dispute.entity';
import { DisputeEvidence } from '../../../src/modules/trust/disputes/entities/dispute-evidence.entity';
import { DisputeStatusHistory } from '../../../src/modules/trust/disputes/entities/dispute-status-history.entity';
import { ResolutionEvent } from '../../../src/modules/trust/holds/entities/resolution-event.entity';
import { PayoutHold } from '../../../src/modules/trust/holds/entities/payout-hold.entity';
import { TrustAuditLog } from '../../../src/modules/trust/audit/entities/trust-audit-log.entity';

import { DisputeService } from '../../../src/modules/trust/disputes/services/dispute.service';
import { HoldService } from '../../../src/modules/trust/holds/services/hold.service';
import { DisputeEscalationJob } from '../../../src/modules/trust/jobs/dispute-escalation.job';
import { TrustAuditService } from '../../../src/modules/trust/audit/services/trust-audit.service';
import { CommissionHold } from '../../../src/modules/trust/holds/entities/commission-hold.entity';

describe('Dispute Flow Workflow (Integration)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let disputeService: DisputeService;
  let escalationJob: DisputeEscalationJob;
  
  let userRepo: Repository<User>;
  let orderRepo: Repository<Order>;
  let disputeRepo: Repository<Dispute>;
  let evidenceRepo: Repository<DisputeEvidence>;
  let holdRepo: Repository<PayoutHold>;
  let resolutionRepo: Repository<ResolutionEvent>;

  let buyer: User;
  let orderValid: Order;
  let orderForEscalation: Order;
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
          User, Order, Dispute, DisputeEvidence, DisputeStatusHistory, 
          ResolutionEvent, PayoutHold, CommissionHold, TrustAuditLog
        ]),
      ],
      providers: [
        DisputeService,
        HoldService,
        TrustAuditService,
        DisputeEscalationJob,
      ],
    }).compile();

    dataSource = module.get(DataSource);
    disputeService = module.get(DisputeService);
    escalationJob = module.get(DisputeEscalationJob);
    
    userRepo = dataSource.getRepository(User);
    orderRepo = dataSource.getRepository(Order);
    disputeRepo = dataSource.getRepository(Dispute);
    evidenceRepo = dataSource.getRepository(DisputeEvidence);
    holdRepo = dataSource.getRepository(PayoutHold);
    resolutionRepo = dataSource.getRepository(ResolutionEvent);

    buyer = await userRepo.save(userRepo.create({ phone: '+919999990003', status: 'active' }));

    orderValid = await orderRepo.save(orderRepo.create({
      buyer_id: buyer.id,
      subtotal: 100,
      total_amount: 100,
      currency: 'INR',
      status: OrderStatus.COMPLETED,
      idempotency_key: uuidv4(),
      completed_at: new Date(),
    }));

    orderForEscalation = await orderRepo.save(orderRepo.create({
      buyer_id: buyer.id,
      subtotal: 100,
      total_amount: 100,
      currency: 'INR',
      status: OrderStatus.DELIVERED,
      idempotency_key: uuidv4(),
      completed_at: new Date(),
    }));
  });

  afterAll(async () => {
    await module?.close();
  });

  it('buyer opens dispute → payout hold created', async () => {
    const idempotencyKey = uuidv4();
    const dispute = await disputeService.openDispute(buyer.id, {
      order_id: orderValid.id,
      reason_code: DisputeReasonCode.ITEM_NOT_RECEIVED,
      idempotency_key: idempotencyKey,
    }, idempotencyKey);

    expect(dispute).toBeDefined();
    expect(dispute.status).toBe(DisputeStatus.OPEN);

    // Verify payout hold created
    const holds = await holdRepo.find({ where: { user_id: buyer.id, reason_ref_id: dispute.id, status: 'active' } });
    expect(holds.length).toBe(1);
    expect(holds[0].reason_type).toBe('dispute_open');
  });

  it('duplicate dispute open → returns existing dispute (idempotency)', async () => {
    const idempotencyKey = uuidv4();
    const first = await disputeService.openDispute(buyer.id, {
      order_id: orderForEscalation.id, // we use this order for the duplicate test and later escalation
      reason_code: DisputeReasonCode.ITEM_NOT_AS_DESCRIBED,
      idempotency_key: idempotencyKey,
    }, idempotencyKey);

    const second = await disputeService.openDispute(buyer.id, {
      order_id: orderForEscalation.id,
      reason_code: DisputeReasonCode.ITEM_NOT_AS_DESCRIBED,
      idempotency_key: idempotencyKey,
    }, idempotencyKey);

    expect(first.id).toBe(second.id);
  });

  it('evidence submitted by buyer is retrievable under dispute', async () => {
    const dispute = await disputeRepo.findOne({ where: { order_id: orderValid.id } });
    await disputeService.submitEvidence(dispute!.id, buyer.id, {
      file_key: 'test-evidence.jpg',
      file_type: 'image/jpeg',
    });

    const evidences = await evidenceRepo.find({ where: { dispute_id: dispute!.id } });
    expect(evidences.length).toBe(1);
    expect(evidences[0].file_key).toBe('test-evidence.jpg');
  });

  it('evidence submitted for wrong dispute_id → 404', async () => {
    await expect(disputeService.submitEvidence(uuidv4(), buyer.id, {
      file_key: 'test.jpg'
    })).rejects.toThrow(); // Trust service throws NotFoundException subclasses typically
  });

  it('admin resolves with no_action → no ResolutionEvent + hold released', async () => {
    // We create a separate dispute to test no_action
    const noActionOrder = await orderRepo.save(orderRepo.create({
      buyer_id: buyer.id,
      subtotal: 100,
      total_amount: 100,
      currency: 'INR',
      status: OrderStatus.COMPLETED,
      idempotency_key: uuidv4(),
    }));

    const dispute = await disputeService.openDispute(buyer.id, {
      order_id: noActionOrder.id,
      reason_code: DisputeReasonCode.OTHER,
      idempotency_key: uuidv4(),
    }, uuidv4());

    const resolved = await disputeService.resolveDispute(dispute.id, adminId, {
      resolution: DisputeResolution.NO_ACTION,
      note: 'no action',
    });

    expect(resolved.status).toBe(DisputeStatus.RESOLVED);
    expect(resolved.resolution).toBe(DisputeResolution.NO_ACTION);

    const events = await resolutionRepo.find({ where: { entity_id: dispute.id } });
    expect(events.length).toBe(0);

    const holds = await holdRepo.find({ where: { reason_ref_id: dispute.id } });
    expect(holds.length).toBe(1);
    expect(holds[0].status).toBe('released');
  });

  it('admin resolves with refund_granted → clawback ResolutionEvent + hold released', async () => {
    const dispute = await disputeRepo.findOne({ where: { order_id: orderValid.id } });
    
    const resolved = await disputeService.resolveDispute(dispute!.id, adminId, {
      resolution: DisputeResolution.REFUND_GRANTED,
      note: 'test refund',
    });

    expect(resolved.status).toBe(DisputeStatus.RESOLVED);
    expect(resolved.resolution).toBe(DisputeResolution.REFUND_GRANTED);
    expect(resolved.clawback_triggered).toBe(true);

    const events = await resolutionRepo.find({ where: { entity_id: dispute!.id, resolution_type: 'clawback_triggered' } });
    expect(events.length).toBe(1);

    const holds = await holdRepo.find({ where: { reason_ref_id: dispute!.id } });
    expect(holds.length).toBe(1);
    expect(holds[0].status).toBe('released');
  });

  it('DisputeEscalationJob → escalates overdue open disputes', async () => {
    const dispute = await disputeRepo.findOne({ where: { order_id: orderForEscalation.id } });
    
    // forcefully backdate creation date
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 4); // 4 days ago
    await disputeRepo.update(dispute!.id, { created_at: overdueDate });

    const result = await escalationJob.run();
    expect(result.escalated).toBeGreaterThanOrEqual(1);

    const escalated = await disputeRepo.findOne({ where: { id: dispute!.id } });
    expect(escalated!.status).toBe(DisputeStatus.ESCALATED);
  });
});
