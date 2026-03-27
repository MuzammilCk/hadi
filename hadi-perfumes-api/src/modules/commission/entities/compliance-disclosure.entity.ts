import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CompensationPolicyVersion } from './compensation-policy-version.entity';

@Entity('compliance_disclosures')
export class ComplianceDisclosure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CompensationPolicyVersion)
  @JoinColumn({ name: 'policy_version_id' })
  policy_version: CompensationPolicyVersion;

  @Column({ unique: true })
  disclosure_key: string;

  @Column({ type: 'text' })
  disclosure_text: string;

  @Column({ default: true })
  is_mandatory: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
