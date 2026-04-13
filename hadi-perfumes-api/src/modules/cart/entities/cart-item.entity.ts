import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';
import { User } from '../../user/entities/user.entity';
import { Listing } from '../../listing/entities/listing.entity';

@Entity('cart_items')
@Unique(['user_id', 'listing_id'])
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  listing_id: string;

  @ManyToOne(() => Listing, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column({ type: 'int', default: 1 })
  qty: number;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;
}
