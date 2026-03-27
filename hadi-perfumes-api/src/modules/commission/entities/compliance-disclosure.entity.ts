import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { CompensationPolicyVersion } from './compensation-policy-version.entity';
import { tstz } from '../../../common/utils/db-type.util';

@Entity('compliance_disclosures')
@Unique(['policy_version', 'disclosure_key'])
export class ComplianceDisclosure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CompensationPolicyVersion)
  @JoinColumn({ name: 'policy_version_id' })
  policy_version: CompensationPolicyVersion;

  @Column()
  disclosure_key: string;

  @Column({ type: 'text' })
  disclosure_text: string;

  @Column({ default: true })
  is_mandatory: boolean;

  @CreateDateColumn({ type: tstz() as any })
  created_at: Date;
}
