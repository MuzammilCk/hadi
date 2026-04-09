import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

export enum DisputeStatus {
  OPEN         = 'open',
  UNDER_REVIEW = 'under_review',
  ESCALATED    = 'escalated',
  RESOLVED     = 'resolved',
  CLOSED       = 'closed',
}

export enum DisputeResolution {
  REFUND_GRANTED  = 'refund_granted',
  REFUND_DENIED   = 'refund_denied',
  PARTIAL_REFUND  = 'partial_refund',
  CLAWBACK_ISSUED = 'clawback_issued',
  NO_ACTION       = 'no_action',
}

export enum DisputeReasonCode {
  ITEM_NOT_RECEIVED     = 'item_not_received',
  ITEM_NOT_AS_DESCRIBED = 'item_not_as_described',
  UNAUTHORIZED_CHARGE   = 'unauthorized_charge',
  DUPLICATE_CHARGE      = 'duplicate_charge',
  OTHER                 = 'other',
}

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) order_id: string;
  @Column({ type: 'uuid' }) buyer_id: string;
  @Column({ type: 'uuid', nullable: true }) return_request_id: string | null;
  @Column({ type: 'varchar', length: 50 }) reason_code: string;
  @Column({ type: 'text', nullable: true }) reason_detail: string | null;
  @Column({ type: 'varchar', length: 30, default: DisputeStatus.OPEN }) status: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) resolution: string | null;
  @Column({ type: 'uuid', nullable: true }) resolved_by: string | null;
  @Column({ type: tstz() as any, nullable: true }) resolved_at: Date | null;
  @Column({ type: 'text', nullable: true }) resolution_note: string | null;
  @Column({ type: tstz() as any, nullable: true }) escalated_at: Date | null;
  @Column({ type: tstz() as any, nullable: true }) closed_at: Date | null;
  @Column({ type: 'boolean', default: false }) refund_triggered: boolean;
  @Column({ type: 'boolean', default: false }) clawback_triggered: boolean;
  @Column({ type: 'varchar', length: 255, unique: true }) idempotency_key: string;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
