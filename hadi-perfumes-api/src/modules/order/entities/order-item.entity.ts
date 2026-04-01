import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'uuid' })
  listing_id: string;

  @Column({ type: 'uuid', nullable: true })
  inventory_reservation_id: string | null;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar' })
  sku: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  unit_price: number;

  @Column({ type: 'int' })
  qty: number;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  line_total: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
