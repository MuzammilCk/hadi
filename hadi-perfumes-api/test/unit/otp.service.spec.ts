import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from '../../src/modules/auth/services/otp.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OtpVerification } from '../../src/modules/auth/entities/otp-verification.entity';
import * as bcrypt from 'bcryptjs';

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-otp'),
  compare: jest
    .fn()
    .mockImplementation((otp, hash) =>
      Promise.resolve(otp === '123456' && hash === 'hashed-otp'),
    ),
}));

describe('OtpService', () => {
  let service: OtpService;

  const mockOtpRepo = {
    update: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: getRepositoryToken(OtpVerification),
          useValue: mockOtpRepo,
        },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  describe('sendOtp', () => {
    it('should invalidate old OTPs and create a new one', async () => {
      await service.sendOtp('+1234567890');

      expect(mockOtpRepo.update).toHaveBeenCalled();
      expect(mockOtpRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+1234567890',
          otp_hash: 'hashed-otp',
        }),
      );
      expect(mockOtpRepo.save).toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('should return false if no valid OTP record is found', async () => {
      mockOtpRepo.findOne.mockResolvedValueOnce(null);

      const isValid = await service.verifyOtp('+1234567890', '123456');
      expect(isValid).toBe(false);
    });

    it('should return false if OTP does not match', async () => {
      mockOtpRepo.findOne.mockResolvedValueOnce({ otp_hash: 'hashed-otp' });

      const isValid = await service.verifyOtp('+1234567890', '000000');
      expect(isValid).toBe(false);
    });

    it('should return true and mark verified if OTP is correct', async () => {
      const record = { otp_hash: 'hashed-otp', verified_at: null };
      mockOtpRepo.findOne.mockResolvedValueOnce(record);

      const isValid = await service.verifyOtp('+1234567890', '123456');

      expect(isValid).toBe(true);
      expect(record.verified_at).not.toBeNull();
      expect(mockOtpRepo.save).toHaveBeenCalled();
    });
  });
});
