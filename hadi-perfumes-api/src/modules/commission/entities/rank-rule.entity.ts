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

@Entity('rank_rules')
export class RankRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CompensationPolicyVersion)
  @JoinColumn({ name: 'policy_version_id' })
  policy_version: CompensationPolicyVersion;

  @Column()
  rank_level: number;

  @Column()
  rank_name: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  personal_sales_volume_requirement: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  downline_sales_volume_requirement: number;

  @Column({ default: 0 })
  active_legs_requirement: number;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
