import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('rank_assignments')
export class RankAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column()
  rank_rule_id: string;

  @Column({ type: tstz() as any })
  assigned_at: Date;

  @Column({ type: tstz() as any, nullable: true })
  revoked_at: Date | null;

  // 'system' or 'admin:<uuid>'
  @Column()
  assigned_by: string;

  @Column()
  policy_version_id: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: tstz() as any })
  created_at: Date;
}
