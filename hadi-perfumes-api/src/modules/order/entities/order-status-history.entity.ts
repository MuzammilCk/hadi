import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('order_status_history')
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'varchar', nullable: true })
  from_status: string | null;

  @Column({ type: 'varchar' })
  to_status: string;

  @Column({ type: 'varchar' })
  actor_type: string;

  @Column({ type: 'varchar', nullable: true })
  actor_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
