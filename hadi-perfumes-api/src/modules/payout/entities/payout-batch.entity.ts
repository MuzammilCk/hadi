import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

export enum PayoutBatchStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('payout_batches')
export class PayoutBatch {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', default: PayoutBatchStatus.PENDING }) status: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) total_amount: number;
  @Column({ type: 'varchar', length: 3, default: 'INR' }) currency: string;
  @Column({ type: 'int', default: 0 }) request_count: number;
  @Column({ type: 'int', default: 0 }) processed_count: number;
  @Column({ type: 'int', default: 0 }) failed_count: number;
  @Column({ type: 'uuid' }) initiated_by: string;
  @Column({ type: tstz() as any, nullable: true }) started_at: Date | null;
  @Column({ type: tstz() as any, nullable: true }) completed_at: Date | null;
  @Column({ type: 'simple-json', nullable: true }) error_summary: Record<string, any> | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
