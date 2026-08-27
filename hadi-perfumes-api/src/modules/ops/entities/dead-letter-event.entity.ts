import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('dead_letter_events')
export class DeadLetterEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 100 }) job_name: string;
  @Column({ type: 'varchar', length: 100 }) queue_name: string;
  @Column({ type: 'varchar', length: 255, nullable: true })
  bull_job_id: string | null;
  @Column({ type: 'simple-json', nullable: true })
  payload: Record<string, any> | null;
  @Column({ type: 'text', nullable: true }) last_error: string | null;
  @Column({ type: 'int', default: 1 }) attempt_count: number;
  @Column({ default: false }) replayable: boolean;
  @Column({ type: tstz() as any, nullable: true }) replayed_at: Date | null;
  @Column({ type: 'uuid', nullable: true }) replayed_by: string | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
