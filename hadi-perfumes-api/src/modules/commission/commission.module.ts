import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Phase 1 — keep all of these
import { CompensationPolicyVersion } from './entities/compensation-policy-version.entity';
import { CommissionRule } from './entities/commission-rule.entity';
import { RankRule } from './entities/rank-rule.entity';
import { ComplianceDisclosure } from './entities/compliance-disclosure.entity';
import { AllowedEarningsClaim } from './entities/allowed-earnings-claim.entity';
import { RuleAuditLog } from './entities/rule-audit-log.entity';
import { PolicyEvaluationService } from './services/policy-evaluation.service';
import { AdminPolicyService } from './services/admin-policy.service';
import { AdminCompensationController } from './controllers/admin-compensation.controller';

// Phase 6 — new additions
import { CommissionEvent } from './entities/commission-event.entity';
import { CommissionEventSource } from './entities/commission-event-source.entity';
import { CommissionCalculationService } from './services/commission-calculation.service';
import { AdminCommissionTriggerController } from './controllers/admin-commission-trigger.controller';
import { CommissionReleaseJob } from '../../jobs/commission-release.job';
import { ClawbackJob } from '../../jobs/clawback.job';

// Entities from other modules needed for read-only access in Phase 6
import { NetworkNode } from '../network/entities/network-node.entity';
import { QualificationState } from '../network/entities/qualification-state.entity';
import { Order } from '../order/entities/order.entity';
import { MoneyEventOutbox } from '../order/entities/money-event-outbox.entity';

import { LedgerModule } from '../ledger/ledger.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      // Phase 1 — keep all
      CompensationPolicyVersion,
      CommissionRule,
      RankRule,
      ComplianceDisclosure,
      AllowedEarningsClaim,
      RuleAuditLog,
      // Phase 6 — new entities
      CommissionEvent,
      CommissionEventSource,
      // Cross-module entities needed for read-only access in Phase 6
      // (NetworkModule and OrderModule do NOT export TypeOrmModule, so we register here)
      NetworkNode,
      QualificationState,
      Order,
      MoneyEventOutbox,
    ]),
    LedgerModule, // Phase 6 — provides LedgerService
  ],
  controllers: [
    AdminCompensationController, // Phase 1 — keep
    AdminCommissionTriggerController, // Phase 6 — new
  ],
  providers: [
    PolicyEvaluationService, // Phase 1 — keep
    AdminPolicyService, // Phase 1 — keep
    CommissionCalculationService, // Phase 6 — new
    CommissionReleaseJob, // Phase 6 — new
    ClawbackJob, // Phase 6 — new (in CommissionModule, needs CommissionEvent repo)
  ],
  exports: [
    PolicyEvaluationService, // Phase 1 — keep
    AdminPolicyService, // Phase 1 — keep
    TypeOrmModule, // Phase 1 — keep
    CommissionCalculationService, // Phase 6 — new
    CommissionReleaseJob, // Phase 6 — new
    ClawbackJob, // Phase 6 — new (exported so PayoutModule can use if needed)
  ],
})
export class CommissionModule {}
