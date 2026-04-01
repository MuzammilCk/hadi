import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('order_audit_logs')
export class OrderAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar' })
  actor_type: string;

  @Column({ type: 'varchar', nullable: true })
  actor_id: string | null;

  @Column({ type: 'simple-json', nullable: true })
  old_value: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  new_value: Record<string, any> | null;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  ip_address: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
