import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { tstz } from '../../../../common/utils/db-type.util';

export enum ModerationTargetType {
  USER = 'user',
  LISTING = 'listing',
  ORDER = 'order',
}

export enum ModerationActionType {
  SUSPEND = 'suspend',
  WARN = 'warn',
  REINSTATE = 'reinstate',
  REVIEW = 'review',
  BAN = 'ban',
}

@Entity('moderation_actions')
export class ModerationAction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 30 }) target_type: string;
  @Column({ type: 'uuid' }) target_id: string;
  @Column({ type: 'varchar', length: 30 }) action_type: string;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'uuid' }) actor_id: string;
  @Column({ type: 'varchar', length: 20, default: 'admin' }) actor_type: string;
  @Column({ type: tstz() as any, nullable: true }) expires_at: Date | null;
  @Column({ type: tstz() as any, nullable: true }) reversed_at: Date | null;
  @Column({ type: 'uuid', nullable: true }) reversed_by: string | null;
  @Column({ type: 'simple-json', nullable: true }) metadata: Record<
    string,
    any
  > | null;
  @Column({ type: 'varchar', length: 255, unique: true })
  idempotency_key: string;
  @CreateDateColumn({ type: tstz() as any }) created_at: Date;
  @UpdateDateColumn({ type: tstz() as any }) updated_at: Date;
}
