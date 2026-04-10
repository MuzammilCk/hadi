import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('network_snapshots')
export class NetworkSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 'scheduled'|'pre_correction'|'post_correction'|'manual'
  @Column()
  snapshot_type: string;

  @Column({ default: 0 })
  user_count: number;

  // JSON blob of all network_nodes
  @Column('text')
  snapshot_data: string;

  @Column()
  triggered_by: string;

  @Column({ type: 'varchar', nullable: true })
  actor_id: string | null;

  @Column({ type: tstz() as any })
  created_at: Date;
}
