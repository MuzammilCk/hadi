import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('money_event_outbox')
export class MoneyEventOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  event_type: string;

  @Column({ type: 'uuid' })
  aggregate_id: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, any>;

  @Column({ default: false })
  published: boolean;

  @Column({ type: tstz() as any, nullable: true })
  published_at: Date | null;

  // Fix H3: retry tracking for dead-letter logic
  @Column({ default: 0 })
  error_count: number;

  @Column({ type: 'varchar', nullable: true })
  last_error: string | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
