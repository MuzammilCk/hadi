import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

@Entity('trust_audit_logs')
export class TrustAuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) actor_id: string | null;
  @Column({ type: 'varchar', length: 20 }) actor_type: string;
  @Column({ type: 'varchar', length: 100 }) action: string;
  @Column({ type: 'varchar', length: 50 }) entity_type: string;
  @Column({ type: 'uuid' }) entity_id: string;
  @Column({ type: 'simple-json', nullable: true }) metadata: Record<string, any> | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
