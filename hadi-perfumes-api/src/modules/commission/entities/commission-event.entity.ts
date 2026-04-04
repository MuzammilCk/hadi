import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

export enum CommissionEventStatus {
  PENDING = 'pending',
  AVAILABLE = 'available',
  PAID = 'paid',
  CLAWED_BACK = 'clawed_back',
  VOIDED = 'voided',
}

@Entity('commission_events')
export class CommissionEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) order_id: string;
  @Column({ type: 'uuid' }) beneficiary_id: string;
  @Column({ type: 'int' }) commission_level: number;
  @Column({ type: 'uuid' }) policy_version_id: string;
  @Column({ type: 'uuid' }) rule_id: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) calculated_amount: number;
  @Column({ type: 'varchar', length: 3, default: 'INR' }) currency: string;
  @Column({ type: 'varchar', default: CommissionEventStatus.PENDING }) status: string;
  @Column({ type: tstz() as any }) available_after: Date;
  @Column({ type: tstz() as any }) clawback_before: Date;
  @Column({ type: 'varchar', length: 255, unique: true }) idempotency_key: string;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
