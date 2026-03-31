import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NetworkGraphService } from '../modules/network/services/network-graph.service';
import { QualificationEngineService } from '../modules/network/services/qualification-engine.service';
import { GraphRebuildJob } from '../modules/network/entities/graph-rebuild-job.entity';

/**
 * QualificationRecalcJob
 *
 * Phase 3: simple @Injectable() service with a manual trigger method.
 * BullMQ queue wiring comes in Phase 8. The admin POST /admin/network/recalculate
 * calls this directly.
 *
 * Job must be idempotent: running twice produces the same result.
 */
@Injectable()
export class QualificationRecalcJob {
  constructor(
    private readonly graphService: NetworkGraphService,
    private readonly qualEngine: QualificationEngineService,
    @InjectRepository(GraphRebuildJob)
    private jobRepo: Repository<GraphRebuildJob>,
  ) {}

  async run(
    policyVersionId: string,
    targetUserId?: string,
    actorId?: string,
  ): Promise<GraphRebuildJob> {
    const now = new Date();

    // 1. Create GraphRebuildJob with status: 'running'
    const job = this.jobRepo.create({
      job_type: 'qualification_recalc',
      status: 'running',
      triggered_by: actorId ? 'admin_manual' : 'system_schedule',
      actor_id: actorId || null,
      target_user_id: targetUserId || null,
      started_at: now,
      nodes_processed: 0,
      created_at: now,
    });
    await this.jobRepo.save(job);

    try {
      if (targetUserId) {
        // 2. If targetUserId: rebuild just that user's node and evaluate qualification
        await this.graphService.buildNodeForUser(targetUserId);
        await this.qualEngine.evaluateUser(
          targetUserId,
          { personalVolume: 0, downlineVolume: 0, activeLegCount: 0 },
          policyVersionId,
        );
        job.nodes_processed = 1;
      } else {
        // 3. If no targetUserId: full rebuild + recalculate all
        const rebuildResult = await this.graphService.rebuildAllNodes(actorId || null);
        const qualResult = await this.qualEngine.recalculateAll(actorId || null, policyVersionId);
        job.nodes_processed = rebuildResult.nodes_processed;
      }

      // 4. Update job: status 'completed'
      job.status = 'completed';
      job.completed_at = new Date();
      await this.jobRepo.save(job);

      return job;
    } catch (error) {
      // 5. On error: update job status 'failed'
      job.status = 'failed';
      job.error_message = error instanceof Error ? error.message : String(error);
      job.completed_at = new Date();
      await this.jobRepo.save(job);
      throw error;
    }
  }
}
