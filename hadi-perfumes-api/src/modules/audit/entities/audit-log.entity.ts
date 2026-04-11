import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 50 })
  entity_type: string;

  @Column({ type: 'varchar', length: 255 })
  entity_id: string;

  @Column({ type: 'simple-json', nullable: true })
  before_snapshot: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  after_snapshot: Record<string, any> | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
