import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { tstz, inet } from '../../../common/utils/db-type.util';
import { User } from '../../user/entities/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 255 })
  token_hash: string;

  @Column({ type: tstz() as any })
  expires_at: Date;

  @Column({ type: tstz() as any, nullable: true })
  revoked_at: Date | null;

  @Column({ type: inet() as any, nullable: true })
  ip_address: string;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
