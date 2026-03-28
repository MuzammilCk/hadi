import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { User } from '../user/entities/user.entity';
import { OnboardingAttempt } from './entities/onboarding-attempt.entity';
import { OtpVerification } from './entities/otp-verification.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { OnboardingAuditLog } from './entities/onboarding-audit-log.entity';
import { OtpService } from './services/otp.service';
import { SignupFlowService } from './services/signup-flow.service';
import { AuthController } from './controllers/auth.controller';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      OnboardingAttempt,
      OtpVerification,
      RefreshToken,
      OnboardingAuditLog,
    ]),
    ThrottlerModule.forRoot([{
        ttl: parseInt(process.env.OTP_SEND_TTL_SECONDS || '60', 10) * 1000,
        limit: parseInt(process.env.OTP_SEND_LIMIT || '5', 10),
    }]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret',
      signOptions: { expiresIn: '15m' },
    }),
    ReferralModule,
  ],
  controllers: [AuthController],
  providers: [OtpService, SignupFlowService],
  exports: [JwtModule],
})
export class AuthModule {}
