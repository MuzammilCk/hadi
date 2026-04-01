import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('payment_webhook_events')
export class PaymentWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  provider: string;

  @Column({ type: 'varchar', unique: true })
  provider_event_id: string;

  @Column({ type: 'varchar' })
  event_type: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, any>;

  @Column({ default: false })
  signature_verified: boolean;

  @Column({ default: false })
  processed: boolean;

  @Column({ type: tstz() as any, nullable: true })
  processed_at: Date | null;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  payment_id: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
