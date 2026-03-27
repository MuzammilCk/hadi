import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CompensationPolicyVersion } from './compensation-policy-version.entity';

@Entity('allowed_earnings_claims')
export class AllowedEarningsClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CompensationPolicyVersion)
  @JoinColumn({ name: 'policy_version_id' })
  policy_version: CompensationPolicyVersion;

  @Column({ type: 'text' })
  claim_text: string;

  @Column({ nullable: true })
  context: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
