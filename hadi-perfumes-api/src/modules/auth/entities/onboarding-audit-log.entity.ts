import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz, inet } from '../../../common/utils/db-type.util';

@Entity('onboarding_audit_logs')
export class OnboardingAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar' })
  target_type: string;

  @Column({ type: 'uuid' })
  target_id: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: any;

  @Column({ type: inet() as any, nullable: true })
  ip_address: string;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
