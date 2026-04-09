import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FraudSignal, FraudSignalSeverity, FraudSignalStatus, FraudSignalType } from '../entities/fraud-signal.entity';
import { RiskAssessment } from '../entities/risk-assessment.entity';
import { AbuseWatchlistEntry } from '../entities/abuse-watchlist-entry.entity';
import { PayoutHold, HoldReasonType } from '../../holds/entities/payout-hold.entity';
import { HoldService } from '../../holds/services/hold.service';
import { TrustAuditService } from '../../audit/services/trust-audit.service';
import { FraudSignalNotFoundException } from '../exceptions/fraud.exceptions';
import { FraudSignalQueryDto } from '../dto/fraud-signal-query.dto';

@Injectable()
export class FraudSignalService {
  private readonly logger = new Logger(FraudSignalService.name);

  constructor(
    @InjectRepository(FraudSignal)
    private readonly fraudSignalRepo: Repository<FraudSignal>,
    @InjectRepository(RiskAssessment)
    private readonly riskAssessmentRepo: Repository<RiskAssessment>,
    @InjectRepository(AbuseWatchlistEntry)
    private readonly abuseWatchlistRepo: Repository<AbuseWatchlistEntry>,
    private readonly holdService: HoldService,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async recordSignal(params: {
    userId?: string;
    orderId?: string;
    signalType: FraudSignalType;
    severity: FraudSignalSeverity;
    source: string;
    evidence?: Record<string, any>;
    ruleRef?: string;
    idempotencyKey: string;
  }): Promise<FraudSignal> {
    // Idempotency check
    const existing = await this.fraudSignalRepo.findOne({
      where: { idempotency_key: params.idempotencyKey },
    });
    if (existing) return existing;

    return this.dataSource.transaction(async (em) => {
      // Create signal
      const signal = await em.save(
        FraudSignal,
        em.create(FraudSignal, {
          user_id: params.userId ?? null,
          order_id: params.orderId ?? null,
          signal_type: params.signalType,
          severity: params.severity,
          source: params.source,
          evidence: params.evidence ?? null,
          rule_ref: params.ruleRef ?? null,
          status: FraudSignalStatus.NEW,
          idempotency_key: params.idempotencyKey,
        }),
      );

      // Upsert RiskAssessment for user
      if (params.userId) {
        await this.upsertRiskAssessment(params.userId, params.severity, em);
      }

      // Auto-place payout hold for high/critical severity
      if (params.userId && [FraudSignalSeverity.HIGH, FraudSignalSeverity.CRITICAL].includes(params.severity)) {
        await this.holdService.placePayoutHold({
          userId: params.userId,
          reasonType: HoldReasonType.FRAUD_REVIEW,
          reasonRefId: signal.id,
          reasonRefType: 'fraud_signal',
          idempotencyKey: `fraud-payout-hold:${signal.id}`,
        }, em);
      }

      // Audit log
      await this.auditService.log({
        actorId: null,
        actorType: 'system',
        action: 'fraud_signal.recorded',
        entityType: 'fraud_signal',
        entityId: signal.id,
        metadata: {
          signal_type: params.signalType,
          severity: params.severity,
          source: params.source,
        },
      }, em);

      return signal;
    });
  }

  private async upsertRiskAssessment(
    userId: string,
    severity: FraudSignalSeverity,
    em: any,
  ): Promise<void> {
    const severityWeights: Record<string, number> = {
      [FraudSignalSeverity.LOW]: parseInt(process.env.RISK_WEIGHT_LOW || '5', 10),
      [FraudSignalSeverity.MEDIUM]: parseInt(process.env.RISK_WEIGHT_MEDIUM || '15', 10),
      [FraudSignalSeverity.HIGH]: parseInt(process.env.RISK_WEIGHT_HIGH || '30', 10),
      [FraudSignalSeverity.CRITICAL]: parseInt(process.env.RISK_WEIGHT_CRITICAL || '50', 10),
    };

    let assessment = await em.findOne(RiskAssessment, { where: { user_id: userId } });

    if (!assessment) {
      assessment = em.create(RiskAssessment, {
        user_id: userId,
        risk_score: 0,
        risk_level: 'low',
        signal_count: 0,
      });
    }

    assessment.signal_count += 1;
    const weight = severityWeights[severity] || 15;
    assessment.risk_score = Math.min(assessment.signal_count * weight, 100);

    // Determine risk level from score
    if (assessment.risk_score >= 90) assessment.risk_level = 'critical';
    else if (assessment.risk_score >= 60) assessment.risk_level = 'high';
    else if (assessment.risk_score >= 30) assessment.risk_level = 'medium';
    else assessment.risk_level = 'low';

    assessment.last_signal_at = new Date();
    assessment.calculated_at = new Date();

    await em.save(RiskAssessment, assessment);
  }

  async reviewSignal(
    signalId: string,
    adminActorId: string,
    verdict: 'actioned' | 'false_positive',
    note?: string,
  ): Promise<FraudSignal> {
    return this.dataSource.transaction(async (em) => {
      const signal = await em.findOne(FraudSignal, { where: { id: signalId } });
      if (!signal) throw new FraudSignalNotFoundException(signalId);

      await em.update(FraudSignal, { id: signalId }, {
        status: verdict === 'false_positive' ? FraudSignalStatus.FALSE_POSITIVE : FraudSignalStatus.ACTIONED,
        reviewed_by: adminActorId,
        reviewed_at: new Date(),
        review_note: note ?? null,
      });

      // If false_positive AND a hold was placed for this signal → release it
      if (verdict === 'false_positive' && signal.user_id) {
        const holdRepo = em.getRepository(PayoutHold);
        const holdForSignal = await holdRepo.findOne({
          where: {
            reason_ref_id: signalId,
            reason_ref_type: 'fraud_signal',
            status: 'active',
          },
        });
        if (holdForSignal) {
          await this.holdService.releasePayoutHold(holdForSignal.id, adminActorId, note ?? 'False positive — hold released', em);
        }
      }

      await this.auditService.log({
        actorId: adminActorId,
        actorType: 'admin',
        action: 'fraud_signal.reviewed',
        entityType: 'fraud_signal',
        entityId: signalId,
        metadata: { verdict, note },
      }, em);

      return (await em.findOne(FraudSignal, { where: { id: signalId } }))!;
    });
  }

  async listSignals(
    query: FraudSignalQueryDto,
  ): Promise<{ data: FraudSignal[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.fraudSignalRepo.createQueryBuilder('fs').where('1=1');
    if (query.status) qb.andWhere('fs.status = :status', { status: query.status });
    if (query.user_id) qb.andWhere('fs.user_id = :userId', { userId: query.user_id });
    qb.orderBy('fs.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getSignal(signalId: string): Promise<FraudSignal> {
    const signal = await this.fraudSignalRepo.findOne({ where: { id: signalId } });
    if (!signal) throw new FraudSignalNotFoundException(signalId);
    return signal;
  }
}
