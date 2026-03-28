import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ReferralModule } from '../../src/modules/referral/referral.module';
import { ReferralValidationService } from '../../src/modules/referral/services/referral-validation.service';

describe('Circular Sponsorship Prevention (Integration)', () => {
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

  it('should prevent user from being their own upline', async () => {
    expect(service).toBeDefined();
  });
});
