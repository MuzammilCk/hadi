import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { enumType, tstz } from '../../../common/utils/db-type.util';
import { User } from '../../user/entities/user.entity';
import { Listing, ListingStatus } from './listing.entity';

export enum ActorType {
  SYSTEM = 'system',
  ADMIN = 'admin',
}

@Entity('listing_status_history')
export class ListingStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  listing_id: string;

  @ManyToOne(() => Listing, (listing) => listing.status_history, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column({ type: 'varchar' })
  from_status: ListingStatus | string;

  @Column({ type: 'varchar' })
  to_status: ListingStatus | string;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User;

  @Column({ type: 'varchar', default: ActorType.SYSTEM })
  actor_type: ActorType | string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
