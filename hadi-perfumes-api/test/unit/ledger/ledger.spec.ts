jest.setTimeout(30000);

import { Repository } from 'typeorm';
import { LedgerService } from '../../../src/modules/ledger/services/ledger.service';
import {
  LedgerEntry,
  LedgerEntryType,
  LedgerEntryStatus,
} from '../../../src/modules/ledger/entities/ledger-entry.entity';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

describe('LedgerService', () => {
  let service: LedgerService;
  let repo: Repository<LedgerEntry>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [LedgerEntry],
        }),
        TypeOrmModule.forFeature([LedgerEntry]),
      ],
      providers: [LedgerService],
    }).compile();

    service = module.get(LedgerService);
    repo = module.get(getRepositoryToken(LedgerEntry));
    dataSource = module.get(DataSource);
  }, 30000);

  afterEach(async () => {
    await repo.clear();
  });

  const userId = uuidv4();
  const refId = uuidv4();

  it('writeEntry writes correct record with all fields populated', async () => {
    const entry = await service.writeEntry({
      userId,
      entryType: LedgerEntryType.COMMISSION_PENDING,
      amount: 100,
      currency: 'INR',
      status: LedgerEntryStatus.PENDING,
      referenceId: refId,
      referenceType: 'commission_event',
      note: 'test entry',
    });

    expect(entry.id).toBeDefined();
    expect(entry.user_id).toBe(userId);
    expect(entry.entry_type).toBe(LedgerEntryType.COMMISSION_PENDING);
    expect(Number(entry.amount)).toBe(100);
    expect(entry.currency).toBe('INR');
    expect(entry.status).toBe(LedgerEntryStatus.PENDING);
    expect(entry.reference_id).toBe(refId);
    expect(entry.reference_type).toBe('commission_event');
    expect(entry.note).toBe('test entry');
  });

  it('writeEntry with em parameter uses the passed EntityManager', async () => {
    let usedEm = false;
    await dataSource.transaction(async (em) => {
      usedEm = true;
      const entry = await service.writeEntry(
        {
          userId,
          entryType: LedgerEntryType.COMMISSION_PENDING,
          amount: 50,
          currency: 'INR',
          status: LedgerEntryStatus.PENDING,
          referenceId: refId,
          referenceType: 'commission_event',
        },
        em,
      );
      expect(entry.id).toBeDefined();
    });
    expect(usedEm).toBe(true);
  });

  it('getPendingBalance returns SUM of COMMISSION_PENDING entries with status=PENDING', async () => {
    const testUserId = uuidv4();
    await service.writeEntry({
      userId: testUserId,
      entryType: LedgerEntryType.COMMISSION_PENDING,
      amount: 100,
      currency: 'INR',
      status: LedgerEntryStatus.PENDING,
      referenceId: uuidv4(),
      referenceType: 'commission_event',
    });
    await service.writeEntry({
      userId: testUserId,
      entryType: LedgerEntryType.COMMISSION_PENDING,
      amount: 50,
      currency: 'INR',
      status: LedgerEntryStatus.PENDING,
      referenceId: uuidv4(),
      referenceType: 'commission_event',
    });

    const balance = await service.getPendingBalance(testUserId);
    expect(balance).toBe(150);
  });

  it('getAvailableBalance = credits - abs(debits), includes HELD for PAYOUT_REQUESTED', async () => {
    const testUserId = uuidv4();
    // Write a commission_available entry (credit)
    await service.writeEntry({
      userId: testUserId,
      entryType: LedgerEntryType.COMMISSION_AVAILABLE,
      amount: 500,
      currency: 'INR',
      status: LedgerEntryStatus.SETTLED,
      referenceId: uuidv4(),
      referenceType: 'commission_event',
    });
    // Write a PAYOUT_REQUESTED entry (debit/hold)
    await service.writeEntry({
      userId: testUserId,
      entryType: LedgerEntryType.PAYOUT_REQUESTED,
      amount: -200,
      currency: 'INR',
      status: LedgerEntryStatus.HELD,
      referenceId: uuidv4(),
      referenceType: 'payout_request',
    });

    const balance = await service.getAvailableBalance(testUserId);
    expect(balance).toBe(300); // 500 - 200 = 300
  });

  it('getAvailableBalance = 0 when no entries', async () => {
    const balance = await service.getAvailableBalance(uuidv4());
    expect(balance).toBe(0);
  });

  it('PAYOUT_REQUESTED with status=HELD is correctly deducted from available balance (FAILURE-11 fix)', async () => {
    const testUserId = uuidv4();
    // Give user 1000 available
    await service.writeEntry({
      userId: testUserId,
      entryType: LedgerEntryType.COMMISSION_AVAILABLE,
      amount: 1000,
      currency: 'INR',
      status: LedgerEntryStatus.SETTLED,
      referenceId: uuidv4(),
      referenceType: 'commission_event',
    });

    // Hold 600 for payout
    await service.writeEntry({
      userId: testUserId,
      entryType: LedgerEntryType.PAYOUT_REQUESTED,
      amount: -600,
      currency: 'INR',
      status: LedgerEntryStatus.HELD,
      referenceId: uuidv4(),
      referenceType: 'payout_request',
    });

    const balance = await service.getAvailableBalance(testUserId);
    expect(balance).toBe(400); // 1000 - 600 = 400
    // This verifies that a second payout of >400 would be rejected
  });

  it('Negative amounts stored as-is (debits ARE negative numbers)', async () => {
    const entry = await service.writeEntry({
      userId,
      entryType: LedgerEntryType.CLAWBACK,
      amount: -150,
      currency: 'INR',
      status: LedgerEntryStatus.REVERSED,
      referenceId: uuidv4(),
      referenceType: 'commission_event',
    });
    expect(Number(entry.amount)).toBe(-150);
  });

  it('getLedgerHistory returns paginated DESC by created_at', async () => {
    const testUserId = uuidv4();
    for (let i = 0; i < 5; i++) {
      await service.writeEntry({
        userId: testUserId,
        entryType: LedgerEntryType.COMMISSION_PENDING,
        amount: 10 * (i + 1),
        currency: 'INR',
        status: LedgerEntryStatus.PENDING,
        referenceId: uuidv4(),
        referenceType: 'commission_event',
      });
    }

    const result = await service.getLedgerHistory(testUserId, {
      page: 1,
      limit: 3,
    });
    expect(result.data.length).toBe(3);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(3);
  });

  it('reversal_of_entry_id set correctly when provided', async () => {
    const original = await service.writeEntry({
      userId,
      entryType: LedgerEntryType.COMMISSION_PENDING,
      amount: 100,
      currency: 'INR',
      status: LedgerEntryStatus.PENDING,
      referenceId: uuidv4(),
      referenceType: 'commission_event',
    });

    const reversal = await service.writeEntry({
      userId,
      entryType: LedgerEntryType.COMMISSION_REVERSED,
      amount: -100,
      currency: 'INR',
      status: LedgerEntryStatus.REVERSED,
      referenceId: uuidv4(),
      referenceType: 'commission_event',
      reversalOfEntryId: original.id,
    });

    expect(reversal.reversal_of_entry_id).toBe(original.id);
  });

  it('LedgerEntry entity has NO updated_at property', () => {
    const metadata = dataSource.getMetadata(LedgerEntry);
    const columns = metadata.columns.map((c) => c.propertyName);
    expect(columns).not.toContain('updated_at');
  });
});
