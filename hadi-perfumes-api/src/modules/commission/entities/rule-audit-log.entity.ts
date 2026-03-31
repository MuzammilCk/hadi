import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('rule_audit_logs')
export class RuleAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string;

  @Column()
  action: string;

  @Column()
  target_type: string;

  @Column({ type: 'uuid' })
  target_id: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: any;

  @Column({
    type: process.env.NODE_ENV === 'test' ? 'varchar' : 'inet',
    nullable: true,
  })
  ip_address: string;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
