import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompensationPolicyVersion } from './entities/compensation-policy-version.entity';
import { CommissionRule } from './entities/commission-rule.entity';
import { RankRule } from './entities/rank-rule.entity';
import { ComplianceDisclosure } from './entities/compliance-disclosure.entity';
import { AllowedEarningsClaim } from './entities/allowed-earnings-claim.entity';
import { RuleAuditLog } from './entities/rule-audit-log.entity';
import { PolicyEvaluationService } from './services/policy-evaluation.service';
import { AdminPolicyService } from './services/admin-policy.service';
import { AdminCompensationController } from './controllers/admin-compensation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompensationPolicyVersion,
      CommissionRule,
      RankRule,
      ComplianceDisclosure,
      AllowedEarningsClaim,
      RuleAuditLog,
    ]),
  ],
  controllers: [AdminCompensationController],
  providers: [PolicyEvaluationService, AdminPolicyService],
  exports: [
    PolicyEvaluationService,
    AdminPolicyService,
    TypeOrmModule,
  ],
})
export class CommissionModule {}
