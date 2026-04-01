import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  order_id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  idempotency_key: string;

  @Column({ type: 'varchar', default: 'stripe' })
  provider: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  provider_payment_intent_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  provider_charge_id: string | null;

  @Column({ type: 'varchar', default: 'pending' })
  status: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: tstz() as any, nullable: true })
  authorized_at: Date | null;

  @Column({ type: tstz() as any, nullable: true })
  captured_at: Date | null;

  @Column({ type: tstz() as any, nullable: true })
  failed_at: Date | null;

  @Column({ type: tstz() as any, nullable: true })
  refunded_at: Date | null;

  @Column({ type: 'varchar', nullable: true })
  failure_reason: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;
}
