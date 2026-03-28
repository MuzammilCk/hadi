import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminPolicyService } from '../../src/modules/commission/services/admin-policy.service';
import { CommissionModule } from '../../src/modules/commission/commission.module';
import { CompensationPolicyVersion } from '../../src/modules/commission/entities/compensation-policy-version.entity';

describe('AdminPolicyService (Integration)', () => {
  jest.setTimeout(30000);

  let service: AdminPolicyService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          dropSchema: true,
          entities: [__dirname + '/../../src/**/*.entity{.ts,.js}'],
          synchronize: true,
        }),
        CommissionModule,
      ],
    }).compile();

    service = module.get<AdminPolicyService>(AdminPolicyService);
    dataSource = module.get<DataSource>(DataSource);
  }, 30000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should create a draft policy, validate it, and activate it', async () => {
    const actorId = '00000000-0000-0000-0000-000000000001';

    // 1. Create a Draft
    const draft = await service.createDraft(
      {
        name: 'Launch Policy',
        commission_rules: [
          {
            level: 1,
            percentage: 0.1,
            payout_delay_days: 14,
            clawback_window_days: 30,
          },
        ],
        compliance_disclosures: [
          {
            disclosure_key: 'earnings_disclaimer',
            disclosure_text: 'Earnings are not guaranteed.',
            is_mandatory: true,
          },
        ],
        allowed_earnings_claims: [],
      },
      actorId,
    );

    expect(draft.id).toBeDefined();
    expect(draft.status).toBe('draft');
    expect(draft.version).toBe(1);

    // 2. Validate the draft
    const validation = await service.validateDraft(draft.id);
    expect(validation.valid).toBe(true);

    // 3. Activate the draft
    const activePolicy = await service.activateDraft(draft.id, actorId);
    expect(activePolicy.status).toBe('active');
    expect(activePolicy.effective_from).toBeDefined();

    // 4. Check Current Active
    const current = await service.getCurrentActivePolicy();
    expect(current?.id).toBe(activePolicy.id);

    // 5. Create newer draft and activate it, causing old one to archive
    const draft2 = await service.createDraft(
      {
        name: 'V2 Policy',
        commission_rules: [{ level: 1, percentage: 0.05 }],
        compliance_disclosures: [
          {
            disclosure_key: 'general',
            disclosure_text: 'text',
            is_mandatory: true,
          },
        ],
      },
      actorId,
    );

    const activePolicy2 = await service.activateDraft(draft2.id, actorId);
    expect(activePolicy2.status).toBe('active');
    expect(activePolicy2.version).toBe(2);

    // Verify V1 is archived
    const v1 = await dataSource
      .getRepository(CompensationPolicyVersion)
      .findOne({ where: { id: draft.id } });
    expect(v1?.status).toBe('archived');
    expect(v1?.effective_to).toBeDefined();
  });
});
