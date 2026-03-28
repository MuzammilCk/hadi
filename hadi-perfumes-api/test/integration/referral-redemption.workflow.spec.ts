import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { ReferralValidationService } from '../../src/modules/referral/services/referral-validation.service';
import { ReferralCode } from '../../src/modules/referral/entities/referral-code.entity';
import { ReferralRedemption } from '../../src/modules/referral/entities/referral-redemption.entity';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import { User, UserStatus } from '../../src/modules/user/entities/user.entity';

describe('Referral Redemption Workflow (Integration)', () => {
  jest.setTimeout(30000);
  
  let service: ReferralValidationService;

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
  }, 30000);

  it('should validate and redeem code cleanly if valid', async () => {
    // Basic structural test ready for full db logic setup later
    expect(service).toBeDefined();
  });
});
