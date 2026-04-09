import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

@Entity('resolution_events')
export class ResolutionEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 30 }) entity_type: string;
  @Column({ type: 'uuid' }) entity_id: string;
  @Column({ type: 'varchar', length: 50 }) resolution_type: string;
  @Column({ type: 'uuid', nullable: true }) actor_id: string | null;
  @Column({ type: 'varchar', length: 20 }) actor_type: string;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ type: 'varchar', length: 255, unique: true }) idempotency_key: string;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
}
