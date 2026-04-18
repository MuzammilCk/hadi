import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { enumType, tstz } from '../../../common/utils/db-type.util';
import { User } from '../../user/entities/user.entity';
import { ProductCategory } from './product-category.entity';
import { ListingImage } from './listing-image.entity';
import { ListingStatusHistory } from './listing-status-history.entity';
import { ListingModerationAction } from './listing-moderation-action.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';

export enum ListingCondition {
  NEW = 'new',
  LIKE_NEW = 'like_new',
  USED = 'used',
  REFURBISHED = 'refurbished',
}

export enum AuthenticityStatus {
  VERIFIED = 'verified',
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
}

export enum ListingStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  ACTIVE = 'active',
  PAUSED = 'paused',
  SOLD_OUT = 'sold_out',
  REMOVED = 'removed',
}

@Entity('listings')
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  seller_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ type: 'uuid', nullable: true })
  category_id: string;

  @ManyToOne(() => ProductCategory, (category) => category.listings, {
    nullable: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ unique: true, type: 'varchar', length: 100 })
  sku: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'smallint', default: 70, nullable: true })
  intensity: number;    // 10-100 scale (Soft: 10-39, Moderate: 40-69, Intense: 70-100)

  @Column({ type: 'varchar' })
  condition: ListingCondition | string;

  @Column({ type: 'varchar', default: AuthenticityStatus.UNVERIFIED })
  authenticity_status: AuthenticityStatus | string;

  @Column({ type: 'varchar', default: ListingStatus.DRAFT })
  status: ListingStatus | string;

  @Column({ default: false })
  requires_approval: boolean;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;

  @OneToMany(() => ListingImage, (image) => image.listing)
  images: ListingImage[];

  @OneToMany(() => ListingStatusHistory, (history) => history.listing)
  status_history: ListingStatusHistory[];

  @OneToMany(() => ListingModerationAction, (action) => action.listing)
  moderation_actions: ListingModerationAction[];

  @OneToOne(() => InventoryItem, (inv) => inv.listing)
  inventory_item: InventoryItem;
}
