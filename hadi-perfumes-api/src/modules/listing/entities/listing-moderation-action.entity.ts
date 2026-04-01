import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { enumType, tstz } from '../../../common/utils/db-type.util';
import { User } from '../../user/entities/user.entity';
import { Listing } from './listing.entity';

export enum ModerationAction {
  APPROVE = 'approve',
  REJECT = 'reject',
  PAUSE = 'pause',
  RESUME = 'resume',
  REMOVE = 'remove',
  FLAG_FOR_REVIEW = 'flag_for_review',
}

@Entity('listing_moderation_actions')
export class ListingModerationAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  listing_id: string;

  @ManyToOne(() => Listing, listing => listing.moderation_actions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column({ type: 'uuid' })
  admin_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'admin_id' })
  admin: User;

  @Column({ type: 'varchar' })
  action: ModerationAction | string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  evidence: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
