import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';
import { Listing } from '../../listing/entities/listing.entity';

@Entity('inventory_items')
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  listing_id: string;

  @OneToOne(() => Listing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column({ type: 'int', default: 0 })
  total_qty: number;

  @Column({ type: 'int', default: 0 })
  available_qty: number;

  @Column({ type: 'int', default: 0 })
  reserved_qty: number;

  @Column({ type: 'int', default: 0 })
  sold_qty: number;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;
}
