import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

@Entity('abuse_watchlist_entries')
export class AbuseWatchlistEntry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'uuid', nullable: true }) added_by: string | null;
  @Column({ type: 'uuid', nullable: true }) removed_by: string | null;
  @Column({ type: tstz() as any, nullable: true }) removed_at: Date | null;
  @Column({ type: 'boolean', default: true }) is_active: boolean;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
