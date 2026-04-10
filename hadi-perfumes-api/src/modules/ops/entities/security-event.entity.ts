import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

export enum SecurityEventType {
  RATE_LIMIT_HIT = 'rate_limit_hit',
  INVALID_ADMIN_TOKEN = 'invalid_admin_token',
  JWT_EXPIRED = 'jwt_expired',
  INVALID_WEBHOOK_SIG = 'invalid_webhook_sig',
  SUSPICIOUS_OTP = 'suspicious_otp',
  REPEATED_AUTH_FAIL = 'repeated_auth_fail',
  PRIVILEGE_ESCALATION_ATTEMPT = 'privilege_escalation_attempt',
}

@Entity('security_events')
export class SecurityEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 50 }) event_type: string;
  @Column({ type: 'varchar', length: 20, default: 'medium' }) severity: string;
  @Column({ type: 'varchar', length: 50, nullable: true })
  ip_address: string | null;
  @Column({ type: 'uuid', nullable: true }) user_id: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true })
  path: string | null;
  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;
  @Column({ type: 'simple-json', nullable: true })
  details: Record<string, any> | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
