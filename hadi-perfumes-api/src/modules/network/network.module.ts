import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NetworkNode } from './entities/network-node.entity';
import { QualificationRule } from './entities/qualification-rule.entity';
import { QualificationState } from './entities/qualification-state.entity';
import { QualificationEvent } from './entities/qualification-event.entity';
import { RankAssignment } from './entities/rank-assignment.entity';
import { GraphRebuildJob } from './entities/graph-rebuild-job.entity';
import { GraphCorrectionLog } from './entities/graph-correction-log.entity';
import { NetworkSnapshot } from './entities/network-snapshot.entity';
import { NetworkGraphService } from './services/network-graph.service';
import { QualificationEngineService } from './services/qualification-engine.service';
import { RankAssignmentService } from './services/rank-assignment.service';
import { QualificationRecalcJob } from '../../jobs/qualification-recalc.job';
import { NetworkController } from './controllers/network.controller';
import { AdminNetworkController } from './controllers/admin-network.controller';
import { UserModule } from '../user/user.module';
import { ReferralModule } from '../referral/referral.module';
import { CommissionModule } from '../commission/commission.module';
import { AuthModule } from '../auth/auth.module';
import { OnboardingAuditLog } from '../auth/entities/onboarding-audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NetworkNode,
      QualificationRule,
      QualificationState,
      QualificationEvent,
      RankAssignment,
      GraphRebuildJob,
      GraphCorrectionLog,
      NetworkSnapshot,
      OnboardingAuditLog,
    ]),
    UserModule,       // for User entity access
    ReferralModule,   // for SponsorshipLink and ReferralValidationService
    CommissionModule, // for PolicyEvaluationService, RankRule, CompensationPolicyVersion
    AuthModule,       // for JwtModule and JwtAuthGuard
  ],
  providers: [
    NetworkGraphService,
    QualificationEngineService,
    RankAssignmentService,
    QualificationRecalcJob,
  ],
  controllers: [
    NetworkController,
    AdminNetworkController,
  ],
  exports: [
    NetworkGraphService,
    QualificationEngineService,
    TypeOrmModule,
  ],
})
export class NetworkModule {}
