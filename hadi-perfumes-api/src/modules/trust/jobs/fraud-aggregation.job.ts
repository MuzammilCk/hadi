import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FraudSignal, FraudSignalSeverity } from '../fraud/entities/fraud-signal.entity';
import { RiskAssessment } from '../fraud/entities/risk-assessment.entity';
import { HoldService } from '../holds/services/hold.service';
import { HoldReasonType } from '../holds/entities/payout-hold.entity';
import { PayoutHold } from '../holds/entities/payout-hold.entity';
import { TrustAuditService } from '../audit/services/trust-audit.service';

@Injectable()
export class FraudAggregationJob {
  private readonly logger = new Logger(FraudAggregationJob.name);

  constructor(
    @InjectRepository(FraudSignal)
    private readonly fraudSignalRepo: Repository<FraudSignal>,
    @InjectRepository(RiskAssessment)
    private readonly riskAssessmentRepo: Repository<RiskAssessment>,
    @InjectRepository(PayoutHold)
    private readonly payoutHoldRepo: Repository<PayoutHold>,
    private readonly holdService: HoldService,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async run(): Promise<void> {
    const severityWeights: Record<string, number> = {
      [FraudSignalSeverity.LOW]: parseInt(process.env.RISK_WEIGHT_LOW || '5', 10),
      [FraudSignalSeverity.MEDIUM]: parseInt(process.env.RISK_WEIGHT_MEDIUM || '15', 10),
      [FraudSignalSeverity.HIGH]: parseInt(process.env.RISK_WEIGHT_HIGH || '30', 10),
      [FraudSignalSeverity.CRITICAL]: parseInt(process.env.RISK_WEIGHT_CRITICAL || '50', 10),
    };

    // Find users with signals that need recalculation
    const assessments = await this.riskAssessmentRepo.find();

    for (const assessment of assessments) {
      try {
        await this.dataSource.transaction(async (em) => {
          // Count ALL signals for this user
          const signals = await em.find(FraudSignal, {
            where: { user_id: assessment.user_id },
          });

          const totalCount = signals.length;
          // Use the highest severity weight found
          let maxWeight = 0;
          for (const signal of signals) {
            const w = severityWeights[signal.severity] || 15;
            if (w > maxWeight) maxWeight = w;
          }

          const riskScore = Math.min(totalCount * maxWeight, 100);
          let riskLevel = 'low';
          if (riskScore >= 90) riskLevel = 'critical';
          else if (riskScore >= 60) riskLevel = 'high';
          else if (riskScore >= 30) riskLevel = 'medium';

          await em.update(RiskAssessment, { id: assessment.id }, {
            risk_score: riskScore,
            risk_level: riskLevel,
            signal_count: totalCount,
            calculated_at: new Date(),
          });

          // If risk_level became critical and no active hold exists
          if (riskLevel === 'critical') {
            const existingHold = await em.findOne(PayoutHold, {
              where: {
                user_id: assessment.user_id,
                reason_type: HoldReasonType.FRAUD_REVIEW,
                status: 'active',
              },
            });
            if (!existingHold) {
              await this.holdService.placePayoutHold({
                userId: assessment.user_id,
                reasonType: HoldReasonType.FRAUD_REVIEW,
                reasonRefId: assessment.id,
                reasonRefType: 'risk_assessment',
                idempotencyKey: `fraud-aggregation-hold:${assessment.user_id}:${Date.now()}`,
              }, em);
            }
          }
        });
      } catch (err) {
        this.logger.error(`Failed to recalculate risk for user ${assessment.user_id}:`, err);
      }
    }

    this.logger.log('FraudAggregationJob: completed');
  }
}
