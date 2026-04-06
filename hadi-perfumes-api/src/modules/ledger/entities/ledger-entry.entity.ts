import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

export enum LedgerEntryType {
  COMMISSION_PENDING = 'commission_pending',
  COMMISSION_AVAILABLE = 'commission_available',
  COMMISSION_REVERSED = 'commission_reversed',
  CLAWBACK = 'clawback',
  PAYOUT_REQUESTED = 'payout_requested',
  PAYOUT_SENT = 'payout_sent',
  PAYOUT_FAILED = 'payout_failed',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
}

export enum LedgerEntryStatus {
  PENDING = 'pending',
  SETTLED = 'settled',
  REVERSED = 'reversed',
  HELD = 'held',
}

@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'varchar', length: 50 }) entry_type: string;
  // Positive = credit, Negative = debit
  @Column({ type: 'numeric', precision: 12, scale: 2 }) amount: number;
  @Column({ type: 'varchar', length: 3, default: 'INR' }) currency: string;
  @Column({ type: 'varchar', length: 50, default: LedgerEntryStatus.PENDING }) status: string;
  @Column({ type: 'uuid' }) reference_id: string;
  @Column({ type: 'varchar', length: 50 }) reference_type: string;
  @Column({ type: 'uuid', nullable: true }) reversal_of_entry_id: string | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true }) idempotency_key: string | null;
  // NO @UpdateDateColumn — WRITE-ONCE ONLY
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
