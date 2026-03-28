import { Test, TestingModule } from '@nestjs/testing';
import { ReferralValidationService } from '../../src/modules/referral/services/referral-validation.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReferralCode, ReferralCodeStatus } from '../../src/modules/referral/entities/referral-code.entity';
import { ReferralRedemption } from '../../src/modules/referral/entities/referral-redemption.entity';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import { ReferralErrorCode, ReferralValidationException } from '../../src/modules/referral/exceptions/referral-validation.exception';

describe('ReferralValidationService', () => {
  let service: ReferralValidationService;

  const mockCodeRepo = {
    manager: {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    },
  };

  const mockRedemptionRepo = {};
  const mockLinkRepo = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralValidationService,
        {
          provide: getRepositoryToken(ReferralCode),
          useValue: mockCodeRepo,
        },
        {
          provide: getRepositoryToken(ReferralRedemption),
          useValue: mockRedemptionRepo,
        },
        {
          provide: getRepositoryToken(SponsorshipLink),
          useValue: mockLinkRepo,
        },
      ],
    }).compile();

    service = module.get<ReferralValidationService>(ReferralValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Validation without transaction', () => {
    it('should reject missing code', async () => {
      await expect(service.validateAndRedeem('', 'new123')).rejects.toThrow(
        new ReferralValidationException(ReferralErrorCode.MISSING_CODE, 'Referral code is missing'),
      );
    });

    it('should reject invalid code format', async () => {
      await expect(service.validateAndRedeem('abc', 'new123')).rejects.toThrow(
        new ReferralValidationException(ReferralErrorCode.INVALID_CODE_FORMAT, 'Invalid code format'),
      );
    });
  });
});
