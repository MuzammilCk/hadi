import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

export enum FraudSignalType {
  DUPLICATE_DEVICE = 'duplicate_device',
  VELOCITY_BREACH = 'velocity_breach',
  SELF_PURCHASE = 'self_purchase',
  SUSPICIOUS_REFUND = 'suspicious_refund',
  CHARGEBACK = 'chargeback',
  ACCOUNT_TAKEOVER = 'account_takeover',
  SYNTHETIC_IDENTITY = 'synthetic_identity',
  SUSPICIOUS_NETWORK = 'suspicious_network',
}

export enum FraudSignalSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum FraudSignalStatus {
  NEW = 'new',
  REVIEWED = 'reviewed',
  ACTIONED = 'actioned',
  FALSE_POSITIVE = 'false_positive',
}

@Entity('fraud_signals')
export class FraudSignal {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) user_id: string | null;
  @Column({ type: 'uuid', nullable: true }) order_id: string | null;
  @Column({ type: 'varchar', length: 50 }) signal_type: string;
  @Column({ type: 'varchar', length: 20, default: FraudSignalSeverity.MEDIUM })
  severity: string;
  @Column({ type: 'varchar', length: 50 }) source: string;
  @Column({ type: 'simple-json', nullable: true }) evidence: Record<
    string,
    any
  > | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) rule_ref:
    | string
    | null;
  @Column({ type: 'varchar', length: 20, default: FraudSignalStatus.NEW })
  status: string;
  @Column({ type: 'uuid', nullable: true }) reviewed_by: string | null;
  @Column({ type: tstz() as any, nullable: true }) reviewed_at: Date | null;
  @Column({ type: 'text', nullable: true }) review_note: string | null;
  @Column({ type: 'varchar', length: 255, unique: true })
  idempotency_key: string;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
