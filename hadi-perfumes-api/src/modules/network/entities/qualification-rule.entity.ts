import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('qualification_rules')
export class QualificationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  policy_version_id: string;

  @Column()
  rule_key: string;

  // 'personal_volume' | 'downline_volume' | 'active_legs'
  @Column()
  rule_type: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  threshold_value: number;

  @Column()
  window_days: number;

  @Column({ default: 'USD', length: 3 })
  currency: string;

  @Column({ default: true })
  is_mandatory: boolean;

  @Column({ default: true })
  is_retail_only: boolean;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: tstz() as any })
  created_at: Date;
}
