jest.setTimeout(30000);

import { v4 as uuidv4 } from 'uuid';
import { FraudSignalService } from '../../../src/modules/trust/fraud/services/fraud-signal.service';
import {
  FraudSignalType,
  FraudSignalSeverity,
  FraudSignalStatus,
} from '../../../src/modules/trust/fraud/entities/fraud-signal.entity';

describe('FraudSignalService', () => {
  let service: FraudSignalService;
  let mockFraudSignalRepo: any;
  let mockRiskAssessmentRepo: any;
  let mockAbuseWatchlistRepo: any;
  let mockHoldService: any;
  let mockAuditService: any;
  let mockDataSource: any;

  const userId = uuidv4();

  beforeEach(() => {
    mockFraudSignalRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };
    mockRiskAssessmentRepo = {};
    mockAbuseWatchlistRepo = {};
    mockHoldService = {
      placePayoutHold: jest.fn().mockResolvedValue({ id: uuidv4() }),
      releasePayoutHold: jest.fn().mockResolvedValue(undefined),
    };
    mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
  });

  function buildService() {
    service = new FraudSignalService(
      mockFraudSignalRepo,
      mockRiskAssessmentRepo,
      mockAbuseWatchlistRepo,
      mockHoldService,
      mockAuditService,
      mockDataSource,
    );
  }

  it('recordSignal: idempotency — returns existing if key already exists', async () => {
    const existing = { id: uuidv4(), idempotency_key: 'fraud-dup-key' };
    mockFraudSignalRepo.findOne.mockResolvedValue(existing);
    mockDataSource = { transaction: jest.fn() };
    buildService();

    const result = await service.recordSignal({
      userId,
      signalType: FraudSignalType.VELOCITY_BREACH,
      severity: FraudSignalSeverity.MEDIUM,
      source: 'test',
      idempotencyKey: 'fraud-dup-key',
    });

    expect(result).toBe(existing);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('recordSignal: places payout hold for HIGH severity', async () => {
    const signalId = uuidv4();
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          save: jest.fn().mockResolvedValue({ id: signalId, user_id: userId }),
          create: jest.fn((_: any, d: any) => d),
          findOne: jest.fn().mockResolvedValue(null), // no existing risk assessment
        };
        return cb(em);
      }),
    };
    buildService();

    await service.recordSignal({
      userId,
      signalType: FraudSignalType.CHARGEBACK,
      severity: FraudSignalSeverity.HIGH,
      source: 'payment_provider',
      idempotencyKey: uuidv4(),
    });

    expect(mockHoldService.placePayoutHold).toHaveBeenCalledWith(
      expect.objectContaining({ reasonType: 'fraud_review' }),
      expect.anything(),
    );
  });

  it('recordSignal: does NOT place hold for LOW severity', async () => {
    const signalId = uuidv4();
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = {
          save: jest.fn().mockResolvedValue({ id: signalId, user_id: userId }),
          create: jest.fn((_: any, d: any) => d),
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(em);
      }),
    };
    buildService();

    await service.recordSignal({
      userId,
      signalType: FraudSignalType.DUPLICATE_DEVICE,
      severity: FraudSignalSeverity.LOW,
      source: 'internal',
      idempotencyKey: uuidv4(),
    });

    expect(mockHoldService.placePayoutHold).not.toHaveBeenCalled();
  });

  it('reviewSignal: throws if signal not found', async () => {
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em);
      }),
    };
    buildService();

    await expect(
      service.reviewSignal(uuidv4(), uuidv4(), 'actioned'),
    ).rejects.toThrow('Fraud signal');
  });

  it('getSignal: throws if not found', async () => {
    mockDataSource = {};
    buildService();

    await expect(service.getSignal(uuidv4())).rejects.toThrow('Fraud signal');
  });
});
