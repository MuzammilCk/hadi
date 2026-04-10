import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

export enum OrderStatus {
  CREATED = 'created',
  PAYMENT_PENDING = 'payment_pending',
  PAYMENT_AUTHORIZED = 'payment_authorized',
  PAID = 'paid',
  PACKING = 'packing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  PAYMENT_FAILED = 'payment_failed',
  REFUNDED = 'refunded',
  CHARGEBACK = 'chargeback',
  DISPUTED = 'disputed',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  idempotency_key: string;

  @Column({ type: 'uuid', nullable: true })
  checkout_session_id: string | null;

  @Column({ type: 'uuid' })
  buyer_id: string;

  @Column({ type: 'varchar', default: OrderStatus.CREATED })
  status: string;

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

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  platform_revenue: number;

  @Column({ type: 'simple-json', nullable: true })
  shipping_address: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  billing_address: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  contact: Record<string, any> | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;

  @Column({ type: tstz() as any, nullable: true })
  completed_at: Date | null;

  @Column({ type: tstz() as any, nullable: true })
  cancelled_at: Date | null;
}
