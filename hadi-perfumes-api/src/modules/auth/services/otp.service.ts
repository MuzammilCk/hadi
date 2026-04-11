import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull } from 'typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { OtpVerification } from '../entities/otp-verification.entity';

export interface IOtpService {
  sendOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, otp: string): Promise<boolean>;
}

@Injectable()
export class OtpService implements IOtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(OtpVerification)
    private readonly otpRepo: Repository<OtpVerification>,
  ) {}

  async sendOtp(phone: string): Promise<void> {
    // Invalidate previous unverified OTPs for this phone
    await this.otpRepo.update(
      { phone, verified_at: IsNull() },
      { expires_at: new Date() }, // Expire immediately
    );

    const otp = randomInt(100000, 999999).toString(); // 6 digits, CSPRNG
    const otpHash = await bcrypt.hash(otp, 12);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

    const verification = this.otpRepo.create({
      phone,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });

    await this.otpRepo.save(verification);

    // Stub mechanism
    // In production, integrate with SMS provider (Twilio, SNS, etc.)
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`[OTP DEV] OTP generated for ${phone}`);
    }
  }

  async verifyOtp(phone: string, otp: string): Promise<boolean> {
    const record = await this.otpRepo.findOne({
      where: {
        phone,
        verified_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
      order: { created_at: 'DESC' },
    });

    if (!record) {
      return false; // Not found or expired
    }

    const isValid = await bcrypt.compare(otp, record.otp_hash);

    if (isValid) {
      record.verified_at = new Date();
      await this.otpRepo.save(record);
    }

    return isValid;
  }
}
