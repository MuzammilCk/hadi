import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('network_nodes')
export class NetworkNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  user_id: string;

  @Column({ type: 'varchar', nullable: true })
  sponsor_id: string | null;

  @Column({ type: 'simple-json', default: '[]' })
  upline_path: string[];

  @Column({ default: 0 })
  depth: number;

  @Column({ default: 0 })
  direct_count: number;

  @Column({ default: 0 })
  total_downline: number;

  @Column({ type: tstz() as any })
  last_rebuilt_at: Date;

  @Column({ type: tstz() as any })
  created_at: Date;

  @Column({ type: tstz() as any })
  updated_at: Date;
}
