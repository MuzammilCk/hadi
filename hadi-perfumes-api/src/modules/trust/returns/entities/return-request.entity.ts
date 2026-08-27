import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

export enum ReturnRequestStatus {
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  ESCALATED = 'escalated',
}

export enum ReturnReasonCode {
  DEFECTIVE = 'defective',
  WRONG_ITEM = 'wrong_item',
  NOT_AS_DESCRIBED = 'not_as_described',
  DAMAGED = 'damaged',
  OTHER = 'other',
}

@Entity('return_requests')
export class ReturnRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) order_id: string;
  @Column({ type: 'uuid' }) buyer_id: string;
  @Column({ type: 'varchar', length: 50 }) reason_code: string;
  @Column({ type: 'text', nullable: true }) reason_detail: string | null;
  @Column({
    type: 'varchar',
    length: 30,
    default: ReturnRequestStatus.PENDING_REVIEW,
  })
  status: string;
  @Column({ type: 'text', nullable: true }) decision_note: string | null;
  @Column({ type: 'uuid', nullable: true }) decided_by: string | null;
  @Column({ type: tstz() as any, nullable: true }) decided_at: Date | null;
  @Column({ type: 'boolean', default: false }) refund_triggered: boolean;
  @Column({ type: 'boolean', default: false }) clawback_triggered: boolean;
  @Column({ type: 'varchar', length: 255, unique: true })
  idempotency_key: string;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
