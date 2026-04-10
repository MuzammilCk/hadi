import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('graph_correction_logs')
export class GraphCorrectionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  // 'sponsor_reassignment'|'path_rebuild'|'depth_fix'
  @Column()
  correction_type: string;

  @Column({ type: 'varchar', nullable: true })
  old_sponsor_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  new_sponsor_id: string | null;

  @Column({ type: 'simple-json', nullable: true })
  old_upline_path: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  new_upline_path: string[] | null;

  @Column('text')
  reason: string;

  @Column()
  actor_id: string;

  @Column({ type: 'varchar', nullable: true })
  sponsorship_link_correction_id: string | null;

  @Column({ type: tstz() as any })
  created_at: Date;
}
