import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { tstz, inet, enumType } from '../../../common/utils/db-type.util';

export enum UserStatus {
  PENDING_OTP = 'pending_otp',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

export enum KycStatus {
  NOT_REQUIRED = 'not_required',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password_hash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  full_name: string;

  @Column({
    type: enumType() as any,
    enum: process.env.NODE_ENV === 'test' ? undefined : UserStatus,
    default: UserStatus.PENDING_OTP,
  })
  status: UserStatus | string;

  @Column({
    type: enumType() as any,
    enum: process.env.NODE_ENV === 'test' ? undefined : KycStatus,
    default: KycStatus.NOT_REQUIRED,
  })
  kyc_status: KycStatus | string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  device_hash: string;

  @Column({ type: inet() as any, nullable: true })
  ip_at_signup: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'sponsor_id' })
  sponsor: User;

  @Column({ type: 'uuid', nullable: true })
  sponsor_id: string;

  @Column({ type: tstz() as any, nullable: true })
  onboarding_completed_at: Date;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;
}
