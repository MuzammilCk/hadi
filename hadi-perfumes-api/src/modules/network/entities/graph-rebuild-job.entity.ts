import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('graph_rebuild_jobs')
export class GraphRebuildJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 'full_rebuild'|'partial_rebuild'|'user_rebuild'|'qualification_recalc'
  @Column()
  job_type: string;

  // 'pending'|'running'|'completed'|'failed'
  @Column({ default: 'pending' })
  status: string;

  // 'system_schedule'|'admin_manual'|'correction_trigger'
  @Column()
  triggered_by: string;

  @Column({ type: 'varchar', nullable: true })
  actor_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  target_user_id: string | null;

  @Column({ default: 0 })
  nodes_processed: number;

  @Column({ type: 'varchar', nullable: true })
  error_message: string | null;

  @Column({ type: tstz() as any, nullable: true })
  started_at: Date | null;

  @Column({ type: tstz() as any, nullable: true })
  completed_at: Date | null;

  @Column({ type: tstz() as any })
  created_at: Date;
}
