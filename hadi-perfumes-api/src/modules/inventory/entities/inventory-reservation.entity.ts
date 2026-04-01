import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { enumType, tstz } from '../../../common/utils/db-type.util';
import { Listing } from '../../listing/entities/listing.entity';
import { InventoryItem } from './inventory-item.entity';

export enum ReservationStatus {
  RESERVED = 'reserved',
  CONFIRMED = 'confirmed',
  RELEASED = 'released',
  EXPIRED = 'expired',
}

@Entity('inventory_reservations')
export class InventoryReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  listing_id: string;

  @ManyToOne(() => Listing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column({ type: 'uuid' })
  inventory_item_id: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventory_item: InventoryItem;

  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'uuid' })
  reserved_by_user_id: string;

  @Column({ type: 'int' })
  qty: number;

  @Column({ type: tstz() as any })
  expires_at: Date;

  @Column({
    type: enumType() as any,
    enum: process.env.NODE_ENV === 'test' ? undefined : ReservationStatus,
    default: ReservationStatus.RESERVED,
  })
  status: ReservationStatus | string;

  @Column({ type: 'int', default: 900 })
  reservation_ttl_seconds: number;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;
}
