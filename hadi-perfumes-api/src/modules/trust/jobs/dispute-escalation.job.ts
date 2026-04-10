import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThan } from 'typeorm';
import { Dispute, DisputeStatus } from '../disputes/entities/dispute.entity';
import { DisputeStatusHistory } from '../disputes/entities/dispute-status-history.entity';
import { TrustAuditService } from '../audit/services/trust-audit.service';

@Injectable()
export class DisputeEscalationJob {
  private readonly logger = new Logger(DisputeEscalationJob.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    private readonly auditService: TrustAuditService,
    private readonly dataSource: DataSource,
  ) {}

  async run(): Promise<{ escalated: number }> {
    const escalateHours = parseInt(
      process.env.DISPUTE_AUTO_ESCALATE_HOURS || '72',
      10,
    );
    const cutoff = new Date(Date.now() - escalateHours * 60 * 60 * 1000);

    const overdueDisputes = await this.disputeRepo
      .createQueryBuilder('d')
      .where('d.status = :status', { status: DisputeStatus.OPEN })
      .andWhere('d.created_at <= :cutoff', { cutoff })
      .getMany();

    let escalated = 0;

    for (const dispute of overdueDisputes) {
      try {
        await this.dataSource.transaction(async (em) => {
          const fresh = await em.findOne(Dispute, {
            where: { id: dispute.id },
          });
          if (!fresh || fresh.status !== DisputeStatus.OPEN) return;

          await em.update(
            Dispute,
            { id: dispute.id },
            {
              status: DisputeStatus.ESCALATED,
              escalated_at: new Date(),
            },
          );

          await em.save(
            DisputeStatusHistory,
            em.create(DisputeStatusHistory, {
              dispute_id: dispute.id,
              from_status: DisputeStatus.OPEN,
              to_status: DisputeStatus.ESCALATED,
              actor_id: null,
              actor_type: 'system',
              note: `Auto-escalated after ${escalateHours} hours`,
            }),
          );

          await this.auditService.log(
            {
              actorId: null,
              actorType: 'system',
              action: 'dispute.auto_escalated',
              entityType: 'dispute',
              entityId: dispute.id,
              metadata: { hours: escalateHours },
            },
            em,
          );
        });
        escalated++;
      } catch (err) {
        this.logger.error(`Failed to escalate dispute ${dispute.id}:`, err);
      }
    }

    this.logger.log(`DisputeEscalationJob: escalated=${escalated}`);
    return { escalated };
  }
}
