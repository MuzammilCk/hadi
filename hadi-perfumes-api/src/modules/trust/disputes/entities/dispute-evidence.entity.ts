import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

@Entity('dispute_evidence')
export class DisputeEvidence {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) dispute_id: string;
  @Column({ type: 'uuid' }) uploaded_by: string;
  @Column({ type: 'varchar', length: 500 }) file_key: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) file_type: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
