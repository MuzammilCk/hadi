import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('commission_event_sources')
export class CommissionEventSource {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) commission_event_id: string;
  @Column({ type: 'uuid' }) outbox_event_id: string;
  @Column({ type: 'uuid' }) order_id: string;
  @Column({ type: 'uuid' }) buyer_id: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) total_amount: number;
  @Column({ type: 'varchar', length: 3, default: 'INR' }) currency: string;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
