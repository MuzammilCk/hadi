import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { CommissionRule } from './commission-rule.entity';

@Entity('compensation_policy_versions')
export class CompensationPolicyVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  version: number;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: ['draft', 'active', 'archived', 'deprecated'], default: 'draft' })
  status: 'draft' | 'active' | 'archived' | 'deprecated';

  @Column({ type: 'timestamptz', nullable: true })
  effective_from: Date;

  @Column({ type: 'timestamptz', nullable: true })
  effective_to: Date;

  @OneToMany(() => CommissionRule, (rule) => rule.policy_version, { cascade: true })
  commission_rules: CommissionRule[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
