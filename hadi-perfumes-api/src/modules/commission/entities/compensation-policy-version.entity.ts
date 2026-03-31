import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CommissionRule } from './commission-rule.entity';
import { ComplianceDisclosure } from './compliance-disclosure.entity';
import { AllowedEarningsClaim } from './allowed-earnings-claim.entity';
import { tstz } from '../../../common/utils/db-type.util';

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

  @Column({
    type: process.env.NODE_ENV === 'test' ? 'varchar' : 'enum',
    enum: ['draft', 'active', 'archived', 'deprecated'],
    default: 'draft',
  })
  status: 'draft' | 'active' | 'archived' | 'deprecated';

  @Column({ type: tstz() as any, nullable: true })
  effective_from: Date;

  @Column({ type: tstz() as any, nullable: true })
  effective_to: Date;

  @OneToMany(() => CommissionRule, (rule) => rule.policy_version, {
    cascade: true,
  })
  commission_rules: CommissionRule[];

  @OneToMany(
    () => ComplianceDisclosure,
    (disclosure) => disclosure.policy_version,
    { cascade: true },
  )
  compliance_disclosures: ComplianceDisclosure[];

  @OneToMany(() => AllowedEarningsClaim, (claim) => claim.policy_version, {
    cascade: true,
  })
  allowed_earnings_claims: AllowedEarningsClaim[];

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;

  @UpdateDateColumn({ type: tstz() as any })
  updated_at: Date;
}
