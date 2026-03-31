import { Injectable, UnauthorizedException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { OtpService } from './otp.service';
import { OnboardingAttempt, OnboardingStage } from '../entities/onboarding-attempt.entity';
import { User, UserStatus, KycStatus } from '../../user/entities/user.entity';
import { SponsorshipLink } from '../../referral/entities/sponsorship-link.entity';
import { ReferralCode, ReferralCodeStatus } from '../../referral/entities/referral-code.entity';
import { OnboardingAuditLog } from '../entities/onboarding-audit-log.entity';
import { ReferralValidationService } from '../../referral/services/referral-validation.service';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from '../entities/refresh-token.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SignupFlowService {
  constructor(
    private otpService: OtpService,
    private referralValidationService: ReferralValidationService,
    @InjectRepository(OnboardingAttempt)
    private attemptRepo: Repository<OnboardingAttempt>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private tokenRepo: Repository<RefreshToken>,
    @InjectEntityManager()
    private em: EntityManager,
    private jwtService: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async sendOtp(phone: string, ipAddress?: string, deviceHash?: string) {
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      throw new BadRequestException('Invalid phone format. Must be E.164');
    }

    const existingUser = await this.userRepo.findOne({ where: { phone, status: UserStatus.ACTIVE } });
    if (existingUser) {
      throw new ConflictException('Phone number is already associated with an active user');
    }

    await this.otpService.sendOtp(phone);
    
    // Invalidate earlier attempts for this phone
    await this.attemptRepo.update({ phone, stage: OnboardingStage.OTP_SENT }, { stage: OnboardingStage.FAILED, failure_reason: 'Re-sent OTP' });

    const attempt = this.attemptRepo.create({
      phone,
      ip_address: ipAddress,
      device_hash: deviceHash,
      stage: OnboardingStage.OTP_SENT,
    });
    
    await this.attemptRepo.save(attempt);
    return { message: 'OTP sent' };
  }

  async verifyOtp(phone: string, otp: string) {
    const attempt = await this.attemptRepo.findOne({
      where: { phone, stage: OnboardingStage.OTP_SENT },
      order: { created_at: 'DESC' },
    });

    if (!attempt) {
      throw new BadRequestException('No pending OTP request found for this phone');
    }

    const isValid = await this.otpService.verifyOtp(phone, otp);

    if (!isValid) {
      // Parse current in-memory failure count from failure_reason field
      // Format: 'Invalid OTP:N' where N is the number of failures so far
      let failCount = 0;
      if (attempt.failure_reason && attempt.failure_reason.startsWith('Invalid OTP:')) {
        failCount = parseInt(attempt.failure_reason.split(':')[1], 10) || 0;
      }
      failCount++;

      // 5-strike lockout: after 5 failures, mark attempt as FAILED and require re-send
      if (failCount >= 5) {
        attempt.stage = OnboardingStage.FAILED;
        attempt.failure_reason = 'Too many failed OTP attempts';
        await this.attemptRepo.save(attempt);
        throw new UnauthorizedException('Too many failed OTP attempts. Please request a new OTP.');
      }

      // Store updated failure count in failure_reason
      attempt.failure_reason = `Invalid OTP:${failCount}`;
      await this.attemptRepo.save(attempt);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    attempt.stage = OnboardingStage.OTP_VERIFIED;
    await this.attemptRepo.save(attempt);

    const sessionToken = this.jwtService.sign(
      { phone, attempt_id: attempt.id, scope: 'signup_only' },
      { expiresIn: '10m' },
    );

    return { verified: true, session_token: sessionToken };
  }

  async signup(
    phone: string,
    fullName: string,
    passwordPlain: string,
    referralCodeStr: string,
    attemptId: string,
    ipAddress?: string,
    deviceHash?: string,
  ) {
    return this.em.transaction(async (txEm) => {
      const existingUser = await txEm.findOne(User, { where: { phone, status: UserStatus.ACTIVE } });
      if (existingUser) {
        throw new ConflictException('User already active');
      }

      // 1. Create User (without sponsor_id initially)
      const passwordHash = await bcrypt.hash(passwordPlain, 12);
      const newUserId = uuidv4();

      const user = txEm.create(User, {
        id: newUserId,
        phone,
        password_hash: passwordHash,
        full_name: fullName,
        status: process.env.NODE_ENV === 'test' ? 'active' : UserStatus.ACTIVE,
        kyc_status: process.env.NODE_ENV === 'test' ? 'not_required' : KycStatus.NOT_REQUIRED,
        ip_at_signup: ipAddress,
        device_hash: deviceHash,
        onboarding_completed_at: new Date(),
      });
      await txEm.save(User, user);

      // 2. Validate and redeem code, if provided
      let sponsorId = undefined;
      let uplinePath = undefined;
      let referralCode = undefined;

      if (referralCodeStr) {
        try {
          const referralResult = await this.referralValidationService.validateAndRedeem(
            referralCodeStr,
            newUserId,
            ipAddress,
            deviceHash,
            txEm,
          );
          sponsorId = referralResult.sponsorId;
          uplinePath = referralResult.uplinePath;
          referralCode = referralResult.referralCode;

          // Update user with sponsor_id
          user.sponsor_id = sponsorId;
          await txEm.save(User, user);
        } catch (e) {
          throw new BadRequestException(e.message || 'Referral validation failed');
        }
      }

      // 3. Create SponsorshipLink (if there is a sponsor)
      if (sponsorId && referralCode) {
        const link = txEm.create(SponsorshipLink, {
          user_id: user.id,
          sponsor_id: sponsorId,
          referral_code_id: referralCode.id,
          upline_path: process.env.NODE_ENV === 'test' ? JSON.stringify(uplinePath) as any : uplinePath,
        });
        await txEm.save(SponsorshipLink, link);
      }

      // 4. Generate a referral code for the new user
      let newCodeStr = this.generateReferralCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const exists = await txEm.findOne(ReferralCode, { where: { code: newCodeStr } });
        if (!exists) break;
        newCodeStr = this.generateReferralCode();
      }
      const newUserCode = txEm.create(ReferralCode, {
        code: newCodeStr,
        owner_id: user.id,
        status: process.env.NODE_ENV === 'test' ? 'active' as any : ReferralCodeStatus.ACTIVE,
      });
      await txEm.save(ReferralCode, newUserCode);

      // 5. Write Audit Log
      const auditLog = txEm.create(OnboardingAuditLog, {
        actor_id: user.id,
        action: 'user_signup',
        target_type: 'user',
        target_id: user.id,
        metadata: process.env.NODE_ENV === 'test' 
          ? JSON.stringify({ sponsor_id: sponsorId, referral_code: referralCodeStr }) as any 
          : { sponsor_id: sponsorId, referral_code: referralCodeStr },
        ip_address: ipAddress,
      });
      await txEm.save(OnboardingAuditLog, auditLog);

      // 4. Update Onboarding Attempt
      if (attemptId) {
        const attempt = await txEm.findOne(OnboardingAttempt, { where: { id: attemptId } });
        if (attempt) {
          attempt.stage = OnboardingStage.COMPLETED;
          await txEm.save(OnboardingAttempt, attempt);
        }
      }

      // 5. Issue Tokens
      const access_token = this.jwtService.sign({ sub: user.id, role: 'buyer' });
      
      const refreshTokenValue = uuidv4();
      const tokenHash = this.hashToken(refreshTokenValue);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      const rt = txEm.create(RefreshToken, {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_address: ipAddress,
      });
      await txEm.save(RefreshToken, rt);

      return {
        user: { id: user.id, phone: user.phone, status: user.status },
        access_token,
        refresh_token: refreshTokenValue,
      };
    });
  }

  async refresh(refreshTokenValue: string) {
    const tokenHash = this.hashToken(refreshTokenValue);

    const rt = await this.tokenRepo.findOne({
      where: { token_hash: tokenHash },
    });

    if (!rt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (rt.revoked_at) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (rt.expires_at < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Revoke old token (single-use rotation)
    rt.revoked_at = new Date();
    await this.tokenRepo.save(rt);

    // Issue new access token
    const access_token = this.jwtService.sign({ sub: rt.user_id, role: 'buyer' });

    // Issue new refresh token
    const newRefreshValue = uuidv4();
    const newTokenHash = this.hashToken(newRefreshValue);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.tokenRepo.save(
      this.tokenRepo.create({
        user_id: rt.user_id,
        token_hash: newTokenHash,
        expires_at: expiresAt,
      }),
    );

    return { access_token, refresh_token: newRefreshValue };
  }

  async logout(refreshTokenValue: string) {
    const tokenHash = this.hashToken(refreshTokenValue);

    const rt = await this.tokenRepo.findOne({
      where: { token_hash: tokenHash },
    });

    if (rt && !rt.revoked_at) {
      rt.revoked_at = new Date();
      await this.tokenRepo.save(rt);
    }

    return { success: true };
  }

  async getOnboardingStatus(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      user_id: userId,
      status: user.status,
      kyc_status: user.kyc_status,
      onboarding_completed_at: user.onboarding_completed_at ?? null,
    };
  }
}
