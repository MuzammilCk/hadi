import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { tstz, enumType } from '../../../common/utils/db-type.util';
import { User } from '../../user/entities/user.entity';

export enum ReferralCodeStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  EXHAUSTED = 'exhausted',
}

@Entity('referral_codes')
export class ReferralCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ type: 'uuid' })
  owner_id: string;

  @Column({
    type: enumType() as any,
    enum: process.env.NODE_ENV === 'test' ? undefined : ReferralCodeStatus,
    default: ReferralCodeStatus.ACTIVE,
  })
  status: ReferralCodeStatus | string;

  @Column({ type: 'int', nullable: true })
  max_uses: number | null;

  @Column({ type: 'int', default: 0 })
  uses_count: number;

  @Column({ type: tstz() as any, nullable: true })
  expires_at: Date | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
