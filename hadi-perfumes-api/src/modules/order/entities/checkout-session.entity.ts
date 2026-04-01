import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

export enum CheckoutSessionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  FAILED = 'failed',
}

@Entity('checkout_sessions')
export class CheckoutSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  idempotency_key: string;

  @Column({ type: 'uuid' })
  buyer_id: string;

  @Column({ type: 'varchar', default: CheckoutSessionStatus.PENDING })
  status: string;

  @Column({ type: 'simple-json' })
  items: Array<{ listing_id: string; qty: number; unit_price: number; title: string; sku: string }>;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  shipping_fee: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  tax_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  discount_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total_amount: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'simple-json', default: '[]' })
  reservation_ids: string[];

  @Column({ type: tstz() as any, nullable: true })
  expires_at: Date | null;

  @Column({ type: tstz() as any, nullable: true })
  completed_at: Date | null;

  @Column({ type: 'varchar', nullable: true })
  failed_reason: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;
}
