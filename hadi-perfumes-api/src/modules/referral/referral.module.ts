import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralCode } from './entities/referral-code.entity';
import { ReferralRedemption } from './entities/referral-redemption.entity';
import { SponsorshipLink } from './entities/sponsorship-link.entity';
import { ReferralValidationService } from './services/referral-validation.service';
import { AdminReferralController } from './controllers/admin-referral.controller';
import { OnboardingAuditLog } from '../auth/entities/onboarding-audit-log.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([
      ReferralCode,
      ReferralRedemption,
      SponsorshipLink,
      OnboardingAuditLog,
    ]),
  ],
  providers: [ReferralValidationService],
  controllers: [AdminReferralController],
  exports: [ReferralValidationService, TypeOrmModule],
})
export class ReferralModule {}
