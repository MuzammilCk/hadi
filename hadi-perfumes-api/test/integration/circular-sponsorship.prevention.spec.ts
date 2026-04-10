import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { ReferralValidationService } from '../../src/modules/referral/services/referral-validation.service';
import { DataSource } from 'typeorm';
import {
  ReferralCode,
  ReferralCodeStatus,
} from '../../src/modules/referral/entities/referral-code.entity';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import {
  ReferralErrorCode,
  ReferralValidationException,
} from '../../src/modules/referral/exceptions/referral-validation.exception';

describe('Circular Sponsorship Prevention (Integration)', () => {
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

  it('should prevent user from being their own upline', async () => {
    const userAId = 'a1000000-0000-0000-0000-000000000000';
    const userBId = 'b2000000-0000-0000-0000-000000000000';

    const userRepo = dataSource.getRepository(User);
    const linkRepo = dataSource.getRepository(SponsorshipLink);
    const codeRepo = dataSource.getRepository(ReferralCode);

    // Create User A
    await userRepo.save(
      userRepo.create({
        id: userAId,
        phone: '+11111111111',
        status: 'active',
        kyc_status: 'not_required',
      }),
    );

    // Create User B
    await userRepo.save(
      userRepo.create({
        id: userBId,
        phone: '+22222222222',
        status: 'active',
        kyc_status: 'not_required',
        sponsor_id: userAId,
      }),
    );

    // User A sponsors User B
    const codeA = await codeRepo.save(
      codeRepo.create({
        code: 'CODEAAAA',
        owner_id: userAId,
        status: ReferralCodeStatus.ACTIVE,
      }),
    );

    await linkRepo.save(
      linkRepo.create({
        user_id: userBId,
        sponsor_id: userAId,
        referral_code_id: codeA.id,
        upline_path: JSON.stringify([userAId]) as any, // User A is in User B's upline
      }),
    );

    // Now, User B tries to sponsor User A (creating a circle: A -> B -> A)
    const codeB = await codeRepo.save(
      codeRepo.create({
        code: 'CODEBBBB',
        owner_id: userBId,
        status: ReferralCodeStatus.ACTIVE,
      }),
    );

    // User A tries to use User B's code. This should throw Circular Sponsorship
    await expect(
      service.validateAndRedeem('CODEBBBB', userAId),
    ).rejects.toThrow(
      new ReferralValidationException(
        ReferralErrorCode.CIRCULAR_SPONSORSHIP,
        'Circular sponsorship detected',
      ),
    );
  });
});
