import { Test, TestingModule } from '@nestjs/testing';
import { SignupFlowService } from '../../src/modules/auth/services/signup-flow.service';
import { OtpService } from '../../src/modules/auth/services/otp.service';
import { ReferralValidationService } from '../../src/modules/referral/services/referral-validation.service';
import { getRepositoryToken, getEntityManagerToken } from '@nestjs/typeorm';
import { OnboardingAttempt } from '../../src/modules/auth/entities/onboarding-attempt.entity';
import { User } from '../../src/modules/user/entities/user.entity';
import { RefreshToken } from '../../src/modules/auth/entities/refresh-token.entity';
import { JwtService } from '@nestjs/jwt';

describe('SignupFlowService', () => {
  let service: SignupFlowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignupFlowService,
        { provide: OtpService, useValue: {} },
        { provide: ReferralValidationService, useValue: {} },
        { provide: getRepositoryToken(OnboardingAttempt), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(RefreshToken), useValue: {} },
        { provide: getEntityManagerToken(), useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    service = module.get<SignupFlowService>(SignupFlowService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
