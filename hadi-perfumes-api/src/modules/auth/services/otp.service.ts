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

    // ENTERPRISE STANDARD: Never leak OTPs to STDOUT in production (prevents CloudWatch/Datadog hijacking)
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      this.logger.log(`[OTP DEV/TEST] OTP generated for ${phone} is: ${otp}`);
    } else {
      // PRODUCTION: Verify SMS provider is configured
      const templateId = process.env.MSG91_TEMPLATE_ID;
      if (!templateId || templateId === 'your_template_id_here') {
        this.logger.error(
          `[OTP CRITICAL] SMS provider not configured! OTP for ${phone.slice(0, 6)}*** was generated but NOT delivered. ` +
          `Set MSG91_TEMPLATE_ID in environment variables to enable SMS delivery.`,
        );
      } else {
        // TODO: Integrate MSG91 / Twilio SMS delivery here
        // await this.smsService.send(phone, templateId, { otp });
        this.logger.warn(
          `[OTP] SMS delivery integration pending — OTP for ${phone.slice(0, 6)}*** stored but not sent via SMS`,
        );
      }
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
