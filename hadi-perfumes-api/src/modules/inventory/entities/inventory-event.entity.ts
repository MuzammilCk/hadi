import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { enumType, tstz } from '../../../common/utils/db-type.util';
import { InventoryItem } from './inventory-item.entity';
import { Listing } from '../../listing/entities/listing.entity';

export enum InventoryEventType {
  STOCK_ADDED = 'stock_added',
  RESERVED = 'reserved',
  RESERVATION_CONFIRMED = 'reservation_confirmed',
  RESERVATION_RELEASED = 'reservation_released',
  RESERVATION_EXPIRED = 'reservation_expired',
  SOLD = 'sold',
  STOCK_ADJUSTED = 'stock_adjusted',
  OVERSELL_BLOCKED = 'oversell_blocked',
}

@Entity('inventory_events')
export class InventoryEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  inventory_item_id: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventory_item: InventoryItem;

  @Column({ type: 'uuid' })
  listing_id: string;

  @ManyToOne(() => Listing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column({ type: 'varchar' })
  event_type: InventoryEventType | string;

  @Column({ type: 'int' })
  qty_delta: number;

  @Column({ type: 'int' })
  qty_after: number;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  reference_id: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
