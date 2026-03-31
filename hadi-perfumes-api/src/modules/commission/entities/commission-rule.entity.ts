import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CompensationPolicyVersion } from './compensation-policy-version.entity';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('commission_rules')
export class CommissionRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(
    () => CompensationPolicyVersion,
    (version) => version.commission_rules,
  )
  @JoinColumn({ name: 'policy_version_id' })
  policy_version: CompensationPolicyVersion;

  @Column()
  level: number;

  @Column({ type: 'numeric', precision: 5, scale: 4 })
  percentage: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  min_order_value: number;

  @Column({ type: 'simple-json', nullable: true })
  eligible_categories: string[];

  @Column({ type: 'simple-json', nullable: true })
  eligible_seller_statuses: string[];

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  cap_per_order: number;

  @Column({ default: 14 })
  payout_delay_days: number;

  @Column({ default: 30 })
  clawback_window_days: number;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
