import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from '../user/entities/user.entity';
import { OnboardingAttempt } from './entities/onboarding-attempt.entity';
import { OtpVerification } from './entities/otp-verification.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { OnboardingAuditLog } from './entities/onboarding-audit-log.entity';
import { OtpService } from './services/otp.service';
import { SignupFlowService } from './services/signup-flow.service';
import { AuthController } from './controllers/auth.controller';
import { MeController } from './controllers/me.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
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
    // ThrottlerModule is registered at the app level (AppModule).
    // OTP-specific rate limits are applied via @Throttle() on endpoints.
    JwtModule.register({
      secret: (() => {
        if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
        if (process.env.NODE_ENV === 'test')
          return 'test-secret-not-for-production';
        throw new Error('FATAL: JWT_SECRET environment variable is required');
      })(),
      signOptions: { expiresIn: '15m' },
    }),
    forwardRef(() => ReferralModule),
  ],
  controllers: [AuthController, MeController],
  providers: [OtpService, SignupFlowService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, SignupFlowService],
})
export class AuthModule {}
