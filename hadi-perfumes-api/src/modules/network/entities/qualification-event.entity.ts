import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('qualification_events')
export class QualificationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  // 'activated'|'deactivated'|'qualified'|'disqualified'|'rank_changed'|'suspended'|'restored'
  @Column()
  event_type: string;

  @Column({ type: 'simple-json', nullable: true })
  previous_state: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  new_state: Record<string, any> | null;

  // 'recalc_job'|'admin_manual'|'order_completed'|'correction_flow'
  @Column()
  trigger_source: string;

  @Column({ type: 'varchar', nullable: true })
  trigger_ref_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  policy_version_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  actor_id: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: tstz() as any })
  created_at: Date;
}
