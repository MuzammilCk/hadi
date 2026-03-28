import { Test, TestingModule } from '@nestjs/testing';
import { ReferralValidationService } from '../../src/modules/referral/services/referral-validation.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReferralCode, ReferralCodeStatus } from '../../src/modules/referral/entities/referral-code.entity';
import { ReferralRedemption } from '../../src/modules/referral/entities/referral-redemption.entity';
import { SponsorshipLink } from '../../src/modules/referral/entities/sponsorship-link.entity';
import {
  ReferralErrorCode,
  ReferralValidationException,
} from '../../src/modules/referral/exceptions/referral-validation.exception';

const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NEW_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CODE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeCode(overrides: Partial<ReferralCode> = {}): ReferralCode {
  return Object.assign(new ReferralCode(), {
    id: CODE_ID,
    code: 'ABCD1234',
    owner_id: OWNER_ID,
    status: ReferralCodeStatus.ACTIVE,
    max_uses: null,
    uses_count: 0,
    expires_at: null,
    ...overrides,
  });
}

describe('ReferralValidationService', () => {
  let service: ReferralValidationService;

  const mockManager = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockCodeRepo = {
    manager: mockManager,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralValidationService,
        {
          provide: getRepositoryToken(ReferralCode),
          useValue: mockCodeRepo,
        },
        {
          provide: getRepositoryToken(ReferralRedemption),
          useValue: {},
        },
        {
          provide: getRepositoryToken(SponsorshipLink),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ReferralValidationService>(ReferralValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('format validation (no DB hit)', () => {
    it('should reject missing code', async () => {
      await expect(service.validateAndRedeem('', NEW_USER_ID)).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.MISSING_CODE,
          'Referral code is missing',
        ),
      );
    });

    it('should reject invalid code format (lowercase)', async () => {
      await expect(
        service.validateAndRedeem('abcd1234', NEW_USER_ID),
      ).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.INVALID_CODE_FORMAT,
          'Invalid code format',
        ),
      );
    });

    it('should reject invalid code format (too short)', async () => {
      await expect(
        service.validateAndRedeem('ABCD123', NEW_USER_ID),
      ).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.INVALID_CODE_FORMAT,
          'Invalid code format',
        ),
      );
    });
  });

  describe('DB-level validation (mocked QueryBuilder)', () => {
    function setupQueryBuilder(code: ReferralCode | null, sponsorLink: SponsorshipLink | null = null) {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      };

      let callCount = 0;
      qb.getOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(code);   // ReferralCode lookup
        if (callCount === 2) return Promise.resolve(sponsorLink); // SponsorshipLink lookup
        return Promise.resolve(null);
      });

      mockManager.createQueryBuilder.mockReturnValue(qb);
      mockManager.findOne.mockResolvedValue(null); // no prior redemption
    }

    it('should reject a disabled code', async () => {
      setupQueryBuilder(makeCode({ status: ReferralCodeStatus.DISABLED }));
      await expect(
        service.validateAndRedeem('ABCD1234', NEW_USER_ID),
      ).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.CODE_DISABLED,
          'Referral code is disabled',
        ),
      );
    });

    it('should reject an exhausted code', async () => {
      setupQueryBuilder(makeCode({ status: ReferralCodeStatus.EXHAUSTED }));
      await expect(
        service.validateAndRedeem('ABCD1234', NEW_USER_ID),
      ).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.CODE_EXHAUSTED,
          'Referral code usage limit reached',
        ),
      );
    });

    it('should reject when uses_count reaches max_uses', async () => {
      setupQueryBuilder(makeCode({ max_uses: 5, uses_count: 5 }));
      await expect(
        service.validateAndRedeem('ABCD1234', NEW_USER_ID),
      ).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.CODE_EXHAUSTED,
          'Referral code usage limit reached',
        ),
      );
    });

    it('should reject an expired code', async () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      setupQueryBuilder(makeCode({ expires_at: pastDate }));
      await expect(
        service.validateAndRedeem('ABCD1234', NEW_USER_ID),
      ).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.CODE_EXPIRED,
          'Referral code has expired',
        ),
      );
    });

    it('should reject self-referral', async () => {
      setupQueryBuilder(makeCode({ owner_id: NEW_USER_ID }));
      await expect(
        service.validateAndRedeem('ABCD1234', NEW_USER_ID),
      ).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.SELF_REFERRAL,
          'Cannot refer yourself',
        ),
      );
    });

    it('should reject duplicate redemption', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(makeCode()),
      };
      mockManager.createQueryBuilder.mockReturnValue(qb);
      // Simulate an existing redemption
      mockManager.findOne.mockResolvedValue({ id: 'existing-redemption' });

      await expect(
        service.validateAndRedeem('ABCD1234', NEW_USER_ID),
      ).rejects.toThrow(
        new ReferralValidationException(
          ReferralErrorCode.DUPLICATE_REDEMPTION,
          'Referral code already redeemed by this user',
        ),
      );
    });

    it('should accept a valid code with no restrictions', async () => {
      const sponsorLink = Object.assign(new SponsorshipLink(), {
        user_id: OWNER_ID,
        upline_path: [],
        corrected_at: null,
      });
      setupQueryBuilder(makeCode(), sponsorLink);

      const result = await service.validateAndRedeem('ABCD1234', NEW_USER_ID);
      expect(result.sponsorId).toBe(OWNER_ID);
      expect(result.uplinePath).toContain(OWNER_ID);
    });
  });
});
