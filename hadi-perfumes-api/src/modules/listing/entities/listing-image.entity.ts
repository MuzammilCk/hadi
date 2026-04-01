import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';
import { Listing } from './listing.entity';

@Entity('listing_images')
export class ListingImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  listing_id: string;

  @ManyToOne(() => Listing, listing => listing.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column()
  storage_key: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ default: false })
  is_primary: boolean;

  @CreateDateColumn({ type: tstz() as any })
  uploaded_at: Date;

  @Column({ type: tstz() as any, nullable: true })
  deleted_at: Date | null;
}
