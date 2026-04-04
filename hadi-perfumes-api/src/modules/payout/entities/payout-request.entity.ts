import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

export enum PayoutRequestStatus {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  BATCHED = 'batched',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('payout_requests')
export class PayoutRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount: number;
  @Column({ type: 'varchar', length: 3, default: 'INR' }) currency: string;
  @Column({ type: 'varchar', default: PayoutRequestStatus.REQUESTED }) status: string;
  @Column({ type: 'varchar', length: 255, unique: true }) idempotency_key: string;
  @Column({ type: 'simple-json', nullable: true }) payout_method: Record<string, any> | null;
  @Column({ type: 'uuid', nullable: true }) batch_id: string | null;
  @Column({ type: 'uuid', nullable: true }) ledger_entry_id: string | null;
  @Column({ type: 'uuid', nullable: true }) approved_by: string | null;
  @Column({ type: tstz() as any, nullable: true }) approved_at: Date | null;
  @Column({ type: 'uuid', nullable: true }) rejected_by: string | null;
  @Column({ type: tstz() as any, nullable: true }) rejected_at: Date | null;
  @Column({ type: 'text', nullable: true }) rejection_reason: string | null;
  @Column({ type: 'text', nullable: true }) failure_reason: string | null;
  @Column({ type: 'varchar', nullable: true }) provider_ref_id: string | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
