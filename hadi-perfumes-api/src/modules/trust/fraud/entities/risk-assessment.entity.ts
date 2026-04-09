import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

@Entity('risk_assessments')
export class RiskAssessment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', unique: true }) user_id: string;
  @Column({ type: 'int', default: 0 }) risk_score: number;
  @Column({ type: 'varchar', length: 20, default: 'low' }) risk_level: string;
  @Column({ type: 'int', default: 0 }) signal_count: number;
  @Column({ type: tstz() as any, nullable: true }) last_signal_at: Date | null;
  @Column({ type: tstz() as any, nullable: true }) calculated_at: Date | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
