import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

@Entity('return_status_history')
export class ReturnStatusHistory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) return_request_id: string;
  @Column({ type: 'varchar', length: 30, nullable: true }) from_status:
    | string
    | null;
  @Column({ type: 'varchar', length: 30 }) to_status: string;
  @Column({ type: 'uuid', nullable: true }) actor_id: string | null;
  @Column({ type: 'varchar', length: 20 }) actor_type: string;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
