import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('qualification_states')
export class QualificationState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  user_id: string;

  @Column({ default: false })
  is_active: boolean;

  @Column({ default: false })
  is_qualified: boolean;

  @Column({ type: 'varchar', nullable: true })
  current_rank_id: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: '0' })
  personal_volume: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: '0' })
  downline_volume: number;

  @Column({ default: 0 })
  active_legs_count: number;

  @Column({ type: 'varchar', nullable: true })
  policy_version_id: string | null;

  @Column({ type: tstz() as any })
  evaluated_at: Date;

  @Column({ type: 'varchar', nullable: true })
  disqualified_reason: string | null;

  @Column({ type: tstz() as any })
  created_at: Date;

  @Column({ type: tstz() as any })
  updated_at: Date;
}
