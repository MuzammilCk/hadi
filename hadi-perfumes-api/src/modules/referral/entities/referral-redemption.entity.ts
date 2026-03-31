import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { tstz, inet } from '../../../common/utils/db-type.util';
import { ReferralCode } from './referral-code.entity';
import { User } from '../../user/entities/user.entity';

@Entity('referral_redemptions')
export class ReferralRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ReferralCode)
  @JoinColumn({ name: 'code_id' })
  code: ReferralCode;

  @Column({ type: 'uuid' })
  code_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'redeemed_by_user_id' })
  redeemed_by_user: User;

  @Column({ type: 'uuid' })
  redeemed_by_user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sponsor_id' })
  sponsor: User;

  @Column({ type: 'uuid' })
  sponsor_id: string;

  @Column({ type: inet() as any, nullable: true })
  ip_address: string;

  @Column({ type: 'varchar', nullable: true })
  device_hash: string;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
