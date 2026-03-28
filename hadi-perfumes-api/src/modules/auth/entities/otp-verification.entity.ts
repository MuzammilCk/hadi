import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('otp_verifications')
export class OtpVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255 })
  otp_hash: string;

  @Column({ type: tstz() as any })
  expires_at: Date;

  @Column({ type: tstz() as any, nullable: true })
  verified_at: Date | null;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
