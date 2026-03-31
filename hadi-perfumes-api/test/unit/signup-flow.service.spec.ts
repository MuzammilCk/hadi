import { Test, TestingModule } from '@nestjs/testing';
import { SignupFlowService } from '../../src/modules/auth/services/signup-flow.service';
import { OtpService } from '../../src/modules/auth/services/otp.service';
import { ReferralValidationService } from '../../src/modules/referral/services/referral-validation.service';
import { getRepositoryToken, getEntityManagerToken } from '@nestjs/typeorm';
import { OnboardingAttempt, OnboardingStage } from '../../src/modules/auth/entities/onboarding-attempt.entity';
import { User, UserStatus } from '../../src/modules/user/entities/user.entity';
import { RefreshToken } from '../../src/modules/auth/entities/refresh-token.entity';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';

describe('SignupFlowService', () => {
  let service: SignupFlowService;

  const mockOtpService = {
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };

  const mockAttemptRepo = {
    update: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
  };

  const mockTokenRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto) => dto),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'mock-token'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignupFlowService,
        { provide: OtpService, useValue: mockOtpService },
        { provide: ReferralValidationService, useValue: {} },
        { provide: getRepositoryToken(OnboardingAttempt), useValue: mockAttemptRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: mockTokenRepo },
        { provide: getEntityManagerToken(), useValue: {} },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<SignupFlowService>(SignupFlowService);
  });

  describe('sendOtp', () => {
    it('should throw BadRequestException if phone format is invalid', async () => {
      await expect(service.sendOtp('123')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if user is already active', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({ status: UserStatus.ACTIVE });
      await expect(service.sendOtp('+1234567890')).rejects.toThrow(ConflictException);
    });

    it('should send OTP and create attempt', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null); // No active user
      mockAttemptRepo.save.mockResolvedValueOnce({ id: 'attempt-1' });

      await service.sendOtp('+1234567890');
      
      expect(mockOtpService.sendOtp).toHaveBeenCalledWith('+1234567890');
      expect(mockAttemptRepo.update).toHaveBeenCalled();
      expect(mockAttemptRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+1234567890', stage: OnboardingStage.OTP_SENT })
      );
    });
  });

  describe('verifyOtp', () => {
    it('should throw BadRequestException if no attempt found', async () => {
      mockAttemptRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.verifyOtp('+1234567890', '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException and increment lockout on failure', async () => {
      const attempt = { phone: '+1234567890', failure_reason: 'Invalid OTP:1' };
      mockAttemptRepo.findOne.mockResolvedValueOnce(attempt);
      mockOtpService.verifyOtp.mockResolvedValueOnce(false);

      await expect(service.verifyOtp('+1234567890', '000000')).rejects.toThrow(UnauthorizedException);
      expect(attempt.failure_reason).toBe('Invalid OTP:2');
      expect(mockAttemptRepo.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException and fail attempt on 5 strikes', async () => {
      const attempt = { phone: '+1234567890', stage: OnboardingStage.OTP_SENT, failure_reason: 'Invalid OTP:4' };
      mockAttemptRepo.findOne.mockResolvedValueOnce(attempt);
      mockOtpService.verifyOtp.mockResolvedValueOnce(false);

      await expect(service.verifyOtp('+1234567890', '000000')).rejects.toThrow(UnauthorizedException);
      expect(attempt.stage).toBe(OnboardingStage.FAILED);
      expect(attempt.failure_reason).toBe('Too many failed OTP attempts');
      expect(mockAttemptRepo.save).toHaveBeenCalled();
    });

    it('should verify OTP and return session token', async () => {
      const attempt = { id: 'attempt-1', phone: '+1234567890', stage: OnboardingStage.OTP_SENT };
      mockAttemptRepo.findOne.mockResolvedValueOnce(attempt);
      mockOtpService.verifyOtp.mockResolvedValueOnce(true);

      const result = await service.verifyOtp('+1234567890', '123456');
      
      expect(attempt.stage).toBe(OnboardingStage.OTP_VERIFIED);
      expect(mockAttemptRepo.save).toHaveBeenCalled();
      expect(result.session_token).toBe('mock-token');
      expect(mockJwtService.sign).toHaveBeenCalled();
    });
  });
});
