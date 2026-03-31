import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CompensationPolicyVersion } from '../entities/compensation-policy-version.entity';
import { RuleAuditLog } from '../entities/rule-audit-log.entity';
import { CreateCompensationPolicyDto } from '../dto/create-compensation-policy.dto';
import { CommissionRule } from '../entities/commission-rule.entity';
import { RankRule } from '../entities/rank-rule.entity';
import { ComplianceDisclosure } from '../entities/compliance-disclosure.entity';
import { AllowedEarningsClaim } from '../entities/allowed-earnings-claim.entity';

@Injectable()
export class AdminPolicyService {
  constructor(
    @InjectRepository(CompensationPolicyVersion)
    private policyVersionRepo: Repository<CompensationPolicyVersion>,
    @InjectRepository(RuleAuditLog)
    private auditLogRepo: Repository<RuleAuditLog>,
    private dataSource: DataSource,
  ) {}

  async createDraft(
    dto: CreateCompensationPolicyDto,
    actorId: string,
  ): Promise<CompensationPolicyVersion> {
    const draft = this.policyVersionRepo.create({
      version: await this.getNextVersionNumber(),
      name: dto.name,
      description: dto.description,
      status: 'draft',
      commission_rules: dto.commission_rules.map((r) => {
        const rule = new CommissionRule();
        Object.assign(rule, r);
        return rule;
      }),
      compliance_disclosures: dto.compliance_disclosures?.map((d) => {
        const disclosure = new ComplianceDisclosure();
        Object.assign(disclosure, d);
        return disclosure;
      }),
      allowed_earnings_claims: dto.allowed_earnings_claims?.map((c) => {
        const claim = new AllowedEarningsClaim();
        Object.assign(claim, c);
        return claim;
      }),
    });

    // Save and log
    const saved = await this.policyVersionRepo.save(draft);

    await this.auditLogRepo.save({
      actor_id: actorId,
      action: 'create_policy_draft',
      target_type: 'CompensationPolicyVersion',
      target_id: saved.id,
      metadata: { version: saved.version, status: 'draft' },
    });

    return saved;
  }

  async validateDraft(
    id: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const draft = await this.policyVersionRepo.findOne({
      where: { id },
      relations: ['commission_rules', 'compliance_disclosures'],
    });

    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'draft')
      throw new BadRequestException('Only drafts can be validated');

    const errors: string[] = [];

    // Compliance Boundary validation
    if (
      !draft.compliance_disclosures ||
      draft.compliance_disclosures.length === 0
    ) {
      errors.push('A policy must define mandatory compliance disclosures');
    }

    // Checking impossible rule sums or levels
    let maxLevel = 0;
    let totalPercentage = 0;
    draft.commission_rules.forEach((rule) => {
      if (rule.level > maxLevel) maxLevel = rule.level;
      totalPercentage += Number(rule.percentage);
      if (rule.percentage < 0)
        errors.push(`Rule level ${rule.level} has negative percentage`);
    });

    if (totalPercentage > 1) {
      // sum > 100%
      errors.push('Total commission percentages across all levels exceed 100%');
    }

    return { valid: errors.length === 0, errors };
  }

  async activateDraft(
    id: string,
    actorId: string,
  ): Promise<CompensationPolicyVersion> {
    const draft = await this.policyVersionRepo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'draft')
      throw new BadRequestException('Only drafts can be activated');

    const validation = await this.validateDraft(id);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Draft is invalid',
        errors: validation.errors,
      });
    }

    return await this.dataSource.transaction(async (manager) => {
      // Archive current active
      const activePolicy = await manager.findOne(CompensationPolicyVersion, {
        where: { status: 'active' },
      });

      if (activePolicy) {
        activePolicy.status = 'archived';
        activePolicy.effective_to = new Date();
        await manager.save(activePolicy);
      }

      // Activate draft
      draft.status = 'active';
      draft.effective_from = new Date();
      const activated = await manager.save(draft);

      // Audit Log
      const auditLog = new RuleAuditLog();
      auditLog.actor_id = actorId;
      auditLog.action = 'activate_policy';
      auditLog.target_type = 'CompensationPolicyVersion';
      auditLog.target_id = activated.id;
      auditLog.metadata = { version: activated.version };
      await manager.save(auditLog);

      return activated;
    });
  }

  async getCurrentActivePolicy(): Promise<CompensationPolicyVersion | null> {
    return this.policyVersionRepo.findOne({
      where: { status: 'active' },
      relations: [
        'commission_rules',
        'compliance_disclosures',
        'allowed_earnings_claims',
      ],
    });
  }

  private async getNextVersionNumber(): Promise<number> {
    const result = await this.policyVersionRepo
      .createQueryBuilder('cpv')
      .select('MAX(cpv.version)', 'maxVersion')
      .getRawOne<{ maxVersion: number | null }>();
    return result?.maxVersion != null ? Number(result.maxVersion) + 1 : 1;
  }
}
