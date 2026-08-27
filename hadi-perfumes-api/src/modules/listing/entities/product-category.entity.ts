import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';
import { Listing } from './listing.entity';

@Entity('product_categories')
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'uuid', nullable: true })
  parent_id: string;

  @ManyToOne(() => ProductCategory, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: ProductCategory;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  is_commission_eligible: boolean;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;

  @OneToMany(() => Listing, (listing) => listing.category)
  listings: Listing[];
}
