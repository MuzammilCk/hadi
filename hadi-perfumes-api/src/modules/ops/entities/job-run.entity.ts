import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('job_runs')
export class JobRun {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 100 }) job_name: string;
  @Column({ type: 'varchar', length: 100 }) queue_name: string;
  @Column({ type: 'varchar', length: 255, nullable: true })
  bull_job_id: string | null;
  @Column({ type: 'varchar', length: 20, default: 'running' }) status: string;
  @Column({ type: 'int', default: 1 }) attempt: number;
  @Column({ type: 'uuid', nullable: true }) actor_id: string | null;
  @Column({ type: 'simple-json', nullable: true })
  payload: Record<string, any> | null;
  @Column({ type: 'simple-json', nullable: true })
  result: Record<string, any> | null;
  @Column({ type: 'text', nullable: true }) error_message: string | null;
  @Column({ type: 'int', nullable: true }) duration_ms: number | null;
  @Column({ type: tstz() as any }) started_at: Date;
  @Column({ type: tstz() as any, nullable: true }) completed_at: Date | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
