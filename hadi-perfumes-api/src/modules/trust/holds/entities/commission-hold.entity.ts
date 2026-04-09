import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';
import { HoldStatus, HoldReasonType } from './payout-hold.entity';

// Re-export enums for convenience
export { HoldStatus, HoldReasonType };

@Entity('commission_holds')
export class CommissionHold {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'uuid', nullable: true }) commission_event_id: string | null;
  @Column({ type: 'varchar', length: 50 }) reason_type: string;
  @Column({ type: 'uuid', nullable: true }) reason_ref_id: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) reason_ref_type: string | null;
  @Column({ type: 'varchar', length: 20, default: HoldStatus.ACTIVE }) status: string;
  @Column({ type: 'uuid', nullable: true }) held_by: string | null;
  @Column({ type: 'uuid', nullable: true }) released_by: string | null;
  @Column({ type: tstz() as any, nullable: true }) released_at: Date | null;
  @Column({ type: 'text', nullable: true }) release_note: string | null;
  @Column({ type: 'varchar', length: 255, unique: true }) idempotency_key: string;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
