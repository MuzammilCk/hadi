import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { TrustAuditLog } from './audit/entities/trust-audit-log.entity';
import { ReturnRequest } from './returns/entities/return-request.entity';
import { ReturnItem } from './returns/entities/return-item.entity';
import { ReturnEvidence } from './returns/entities/return-evidence.entity';
import { ReturnStatusHistory } from './returns/entities/return-status-history.entity';
import { Dispute } from './disputes/entities/dispute.entity';
import { DisputeEvidence } from './disputes/entities/dispute-evidence.entity';
import { DisputeStatusHistory } from './disputes/entities/dispute-status-history.entity';
import { FraudSignal } from './fraud/entities/fraud-signal.entity';
import { RiskAssessment } from './fraud/entities/risk-assessment.entity';
import { AbuseWatchlistEntry } from './fraud/entities/abuse-watchlist-entry.entity';
import { ModerationAction } from './moderation/entities/moderation-action.entity';
import { PayoutHold } from './holds/entities/payout-hold.entity';
import { CommissionHold } from './holds/entities/commission-hold.entity';
import { ResolutionEvent } from './holds/entities/resolution-event.entity';

// Cross-module entities needed for read-only access
import { Order } from '../order/entities/order.entity';
import { CommissionEvent } from '../commission/entities/commission-event.entity';

// Services
import { TrustAuditService } from './audit/services/trust-audit.service';
import { ReturnService } from './returns/services/return.service';
import { DisputeService } from './disputes/services/dispute.service';
import { HoldService } from './holds/services/hold.service';
import { FraudSignalService } from './fraud/services/fraud-signal.service';
import { ModerationService } from './moderation/services/moderation.service';

// Jobs
import { ReturnEligibilityJob } from './jobs/return-eligibility.job';
import { DisputeEscalationJob } from './jobs/dispute-escalation.job';
import { FraudAggregationJob } from './jobs/fraud-aggregation.job';
import { HoldPropagationJob } from './jobs/hold-propagation.job';

// Controllers
import { ReturnController } from './returns/controllers/return.controller';
import { AdminReturnController } from './returns/controllers/admin-return.controller';
import { DisputeController } from './disputes/controllers/dispute.controller';
import { AdminDisputeController } from './disputes/controllers/admin-dispute.controller';
import { AdminFraudController } from './fraud/controllers/admin-fraud.controller';
import { AdminModerationController } from './moderation/controllers/admin-moderation.controller';
import { AdminHoldController } from './admin-hold.controller';

// External module dependencies
import { AuthModule } from '../auth/auth.module';
import { CommissionModule } from '../commission/commission.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TrustAuditLog,
      ReturnRequest,
      ReturnItem,
      ReturnEvidence,
      ReturnStatusHistory,
      Dispute,
      DisputeEvidence,
      DisputeStatusHistory,
      FraudSignal,
      RiskAssessment,
      AbuseWatchlistEntry,
      ModerationAction,
      PayoutHold,
      CommissionHold,
      ResolutionEvent,
      // Cross-module entities for read-only access
      Order,
      CommissionEvent,
    ]),
    AuthModule,
    forwardRef(() => CommissionModule),
  ],
  providers: [
    TrustAuditService,
    ReturnService,
    DisputeService,
    HoldService,
    FraudSignalService,
    ModerationService,
    ReturnEligibilityJob,
    DisputeEscalationJob,
    FraudAggregationJob,
    HoldPropagationJob,
  ],
  controllers: [
    ReturnController,
    AdminReturnController,
    DisputeController,
    AdminDisputeController,
    AdminFraudController,
    AdminModerationController,
    AdminHoldController,
  ],
  exports: [HoldService, FraudSignalService, TrustAuditService],
})
export class TrustModule {}
