import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';
import { User } from '../../user/entities/user.entity';
import { ReferralCode } from './referral-code.entity';

@Entity('sponsorship_links')
export class SponsorshipLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', unique: true })
  user_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sponsor_id' })
  sponsor: User;

  @Column({ type: 'uuid' })
  sponsor_id: string;

  @ManyToOne(() => ReferralCode)
  @JoinColumn({ name: 'referral_code_id' })
  referral_code: ReferralCode;

  @Column({ type: 'uuid' })
  referral_code_id: string;

  @Column({ type: 'simple-json' })
  upline_path: string[];

  @Column({ type: tstz() as any, nullable: true })
  corrected_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  corrected_by: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
