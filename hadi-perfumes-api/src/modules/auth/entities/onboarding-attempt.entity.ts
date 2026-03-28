import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { tstz, inet, enumType } from '../../../common/utils/db-type.util';

export enum OnboardingStage {
  OTP_SENT = 'otp_sent',
  OTP_VERIFIED = 'otp_verified',
  REFERRAL_VALIDATED = 'referral_validated',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('onboarding_attempts')
export class OnboardingAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: inet() as any, nullable: true })
  ip_address: string;

  @Column({ type: 'varchar', nullable: true })
  device_hash: string;

  @Column({
    type: enumType() as any,
    enum: process.env.NODE_ENV === 'test' ? undefined : OnboardingStage,
  })
  stage: OnboardingStage | string;

  @Column({ type: 'varchar', nullable: true })
  failure_reason: string;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;
}
