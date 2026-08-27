import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

@Entity('dispute_status_history')
export class DisputeStatusHistory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) dispute_id: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) from_status:
    | string
    | null;
  @Column({ type: 'varchar', length: 30 }) to_status: string;
  @Column({ type: 'uuid', nullable: true }) actor_id: string | null;
  @Column({ type: 'varchar', length: 20 }) actor_type: string;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
