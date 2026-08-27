import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { ReferralValidationService } from '../../src/modules/referral/services/referral-validation.service';
import {
  ReferralCode,
  ReferralCodeStatus,
} from '../../src/modules/referral/entities/referral-code.entity';
import { ReferralRedemption } from '../../src/modules/referral/entities/referral-redemption.entity';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import { User, UserStatus } from '../../src/modules/user/entities/user.entity';
import { DataSource } from 'typeorm';

describe('Referral Redemption Workflow (Integration)', () => {
  jest.setTimeout(30000);

  let service: ReferralValidationService;
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
        AuthModule,
        ReferralModule,
      ],
    }).compile();

    service = module.get<ReferralValidationService>(ReferralValidationService);
    dataSource = module.get<DataSource>(DataSource);
  }, 30000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should validate and redeem code cleanly if valid', async () => {
    const ownerId = 'o1000000-0000-0000-0000-000000000000';
    const newUserId = 'n2000000-0000-0000-0000-000000000000';

    const userRepo = dataSource.getRepository(User);
    const codeRepo = dataSource.getRepository(ReferralCode);

    // Create owner
    await userRepo.save(
      userRepo.create({
        id: ownerId,
        phone: '+99999999999',
        status: 'active',
        kyc_status: 'not_required',
      }),
    );

    // Create code
    const code = await codeRepo.save(
      codeRepo.create({
        code: 'VALID123',
        owner_id: ownerId,
        status: ReferralCodeStatus.ACTIVE,
      }),
    );

    // Create the new user first so FK constraints pass when redemption is saved
    await userRepo.save(
      userRepo.create({
        id: newUserId,
        phone: '+88888888888',
        status: 'active',
        kyc_status: 'not_required',
      }),
    );

    await dataSource.transaction(async (em) => {
      const result = await service.validateAndRedeem(
        'VALID123',
        newUserId,
        '127.0.0.1',
        'device123',
        em,
      );

      expect(result.sponsorId).toBe(ownerId);
      expect(result.uplinePath).toContain(ownerId);
      expect(result.referralCode.code).toBe('VALID123');
    });

    // Check redemption record exists
    const redemptionRepo = dataSource.getRepository(ReferralRedemption);
    const redemption = await redemptionRepo.findOne({
      where: { code_id: code.id, redeemed_by_user_id: newUserId },
    });

    expect(redemption).toBeDefined();
    expect(redemption!.sponsor_id).toBe(ownerId);

    // Check usage count incremented
    const updatedCode = await codeRepo.findOne({ where: { id: code.id } });
    expect(updatedCode!.uses_count).toBe(1);
  });
});
