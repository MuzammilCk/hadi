jest.setTimeout(30000);

import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { CommissionReleaseJob } from '../../src/jobs/commission-release.job';
import { LedgerService } from '../../src/modules/ledger/services/ledger.service';
import { CommissionEvent, CommissionEventStatus } from '../../src/modules/commission/entities/commission-event.entity';
import { LedgerEntry, LedgerEntryType, LedgerEntryStatus } from '../../src/modules/ledger/entities/ledger-entry.entity';

describe('Ledger Release Workflow (Integration)', () => {
  let releaseJob: CommissionReleaseJob;
  let ledgerService: LedgerService;
  let dataSource: DataSource;

  const beneficiaryId = uuidv4();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          synchronize: true,
          entities: [CommissionEvent, LedgerEntry],
        }),
        TypeOrmModule.forFeature([CommissionEvent, LedgerEntry]),
      ],
      providers: [CommissionReleaseJob, LedgerService],
    }).compile();

    releaseJob = module.get(CommissionReleaseJob);
    ledgerService = module.get(LedgerService);
    dataSource = module.get(DataSource);
  }, 30000);

  it('CommissionReleaseJob.run() releases pending → available and writes ledger entry', async () => {
    const ceRepo = dataSource.getRepository(CommissionEvent);
    const eventId = uuidv4();
    await ceRepo.save(ceRepo.create({
      id: eventId,
      order_id: uuidv4(),
      beneficiary_id: beneficiaryId,
      commission_level: 1,
      policy_version_id: uuidv4(),
      rule_id: uuidv4(),
      calculated_amount: 100,
      currency: 'INR',
      status: CommissionEventStatus.PENDING,
      available_after: new Date(Date.now() - 86400000), // Past
      clawback_before: new Date(Date.now() + 30 * 86400000),
      idempotency_key: `test:release:${eventId}`,
    }));

    // Write pending ledger entry first (matches real flow)
    await ledgerService.writeEntry({
      userId: beneficiaryId,
      entryType: LedgerEntryType.COMMISSION_PENDING,
      amount: 100,
      currency: 'INR',
      status: LedgerEntryStatus.PENDING,
      referenceId: eventId,
      referenceType: 'commission_event',
    });

    const result = await releaseJob.run();
    expect(result.released).toBe(1);
    expect(result.errors).toBe(0);

    // Verify commission event status changed
    const updated = await ceRepo.findOne({ where: { id: eventId } });
    expect(updated!.status).toBe('available');

    // Verify COMMISSION_AVAILABLE ledger entry written
    const leRepo = dataSource.getRepository(LedgerEntry);
    const entries = await leRepo.find({
      where: { reference_id: eventId, entry_type: LedgerEntryType.COMMISSION_AVAILABLE },
    });
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe(LedgerEntryStatus.SETTLED);
    expect(Number(entries[0].amount)).toBe(100);
  });

  it('CommissionReleaseJob.run() with available_after in the future: no change', async () => {
    const ceRepo = dataSource.getRepository(CommissionEvent);
    const eventId = uuidv4();
    await ceRepo.save(ceRepo.create({
      id: eventId,
      order_id: uuidv4(),
      beneficiary_id: beneficiaryId,
      commission_level: 1,
      policy_version_id: uuidv4(),
      rule_id: uuidv4(),
      calculated_amount: 200,
      currency: 'INR',
      status: CommissionEventStatus.PENDING,
      available_after: new Date(Date.now() + 30 * 86400000), // Future
      clawback_before: new Date(Date.now() + 60 * 86400000),
      idempotency_key: `test:future:${eventId}`,
    }));

    const result = await releaseJob.run();
    // The future event should not be released
    const updated = await ceRepo.findOne({ where: { id: eventId } });
    expect(updated!.status).toBe(CommissionEventStatus.PENDING);
  });

  it('Run twice on same data: released exactly once (idempotent)', async () => {
    // First run already ran above and released the first event
    const result = await releaseJob.run();
    // No new pending events with past available_after to release
    expect(result.released).toBe(0);
  });

  it('getAvailableBalance reflects commission after release', async () => {
    const available = await ledgerService.getAvailableBalance(beneficiaryId);
    // Should have the released 100 as available
    expect(available).toBe(100);
  });

  it('getPendingBalance reflects pending commission entries', async () => {
    const pending = await ledgerService.getPendingBalance(beneficiaryId);
    // The original COMMISSION_PENDING entry (100) is still there
    expect(pending).toBeGreaterThanOrEqual(100);
  });
});
