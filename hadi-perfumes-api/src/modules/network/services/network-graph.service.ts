import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager, IsNull } from 'typeorm';
import { NetworkNode } from '../entities/network-node.entity';
import { GraphRebuildJob } from '../entities/graph-rebuild-job.entity';
import { GraphCorrectionLog } from '../entities/graph-correction-log.entity';
import { NetworkSnapshot } from '../entities/network-snapshot.entity';
import { QualificationEvent } from '../entities/qualification-event.entity';
import { SponsorshipLink } from '../../referral/entities/sponsorship-link.entity';
import { User } from '../../user/entities/user.entity';
import { OnboardingAuditLog } from '../../auth/entities/onboarding-audit-log.entity';
import { GraphCorrectionDto } from '../dto/graph-correction.dto';
import { NetworkCycleException, NetworkNodeNotFoundException } from '../exceptions/network.exceptions';

@Injectable()
export class NetworkGraphService {
  constructor(
    @InjectRepository(NetworkNode)
    private nodeRepo: Repository<NetworkNode>,
    @InjectRepository(GraphRebuildJob)
    private jobRepo: Repository<GraphRebuildJob>,
    @InjectRepository(GraphCorrectionLog)
    private correctionLogRepo: Repository<GraphCorrectionLog>,
    @InjectRepository(NetworkSnapshot)
    private snapshotRepo: Repository<NetworkSnapshot>,
    @InjectRepository(QualificationEvent)
    private qualEventRepo: Repository<QualificationEvent>,
    @InjectRepository(SponsorshipLink)
    private linkRepo: Repository<SponsorshipLink>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(OnboardingAuditLog)
    private auditLogRepo: Repository<OnboardingAuditLog>,
    @InjectEntityManager()
    private defaultEm: EntityManager,
  ) {}

  /**
   * Parse upline_path handling both JSON string and array due to SQLite/PostgreSQL duality.
   */
  private parsePath(raw: string | string[] | null | undefined): string[] {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return raw;
  }

  /**
   * Detect if userId already exists in the proposed upline path (cycle).
   */
  detectCycle(userId: string, uplinePath: string[]): boolean {
    return uplinePath.includes(userId);
  }

  /**
   * Build or rebuild a NetworkNode for a single user from their active SponsorshipLink.
   */
  async buildNodeForUser(userId: string, em?: EntityManager): Promise<NetworkNode> {
    const manager = em || this.defaultEm;

    // Load active SponsorshipLink (corrected_at IS NULL, latest by created_at)
    const activeLink = await manager.findOne(SponsorshipLink, {
      where: { user_id: userId, corrected_at: IsNull() },
      order: { created_at: 'DESC' },
    });

    let sponsorId: string | null = null;
    let uplinePath: string[] = [];
    let depth = 0;

    if (activeLink) {
      sponsorId = activeLink.sponsor_id;
      uplinePath = this.parsePath(activeLink.upline_path);

      // Cycle detection — throw if userId already in its own upline
      if (this.detectCycle(userId, uplinePath)) {
        throw new NetworkCycleException(userId);
      }

      depth = uplinePath.length;
    }

    const now = new Date();

    // Upsert: find existing or create new
    let node = await manager.findOne(NetworkNode, { where: { user_id: userId } });

    if (node) {
      node.sponsor_id = sponsorId;
      node.upline_path = process.env.NODE_ENV === 'test'
        ? (JSON.stringify(uplinePath) as any)
        : uplinePath;
      node.depth = depth;
      node.last_rebuilt_at = now;
      node.updated_at = now;
    } else {
      node = manager.create(NetworkNode, {
        user_id: userId,
        sponsor_id: sponsorId,
        upline_path: process.env.NODE_ENV === 'test'
          ? (JSON.stringify(uplinePath) as any)
          : uplinePath,
        depth,
        direct_count: 0,
        total_downline: 0,
        last_rebuilt_at: now,
        created_at: now,
        updated_at: now,
      });
    }

    return manager.save(NetworkNode, node);
  }

  /**
   * Rebuild all nodes — full graph rebuild. Idempotent: running twice produces the same result.
   */
  async rebuildAllNodes(actorId: string | null): Promise<GraphRebuildJob> {
    const now = new Date();
    const job = this.jobRepo.create({
      job_type: 'full_rebuild',
      status: 'running',
      triggered_by: actorId ? 'admin_manual' : 'system_schedule',
      actor_id: actorId,
      started_at: now,
      nodes_processed: 0,
      created_at: now,
    });
    await this.jobRepo.save(job);

    try {
      // Load all user IDs
      const users = await this.userRepo.find({ select: ['id'] });

      // Build node for each user
      for (const user of users) {
        await this.buildNodeForUser(user.id);
      }

      // Recalculate direct_count and total_downline for each node
      await this.recalculateCounters();

      job.status = 'completed';
      job.nodes_processed = users.length;
      job.completed_at = new Date();
      await this.jobRepo.save(job);

      return job;
    } catch (error) {
      job.status = 'failed';
      job.error_message = error instanceof Error ? error.message : String(error);
      job.completed_at = new Date();
      await this.jobRepo.save(job);
      throw error;
    }
  }

  /**
   * Recalculate direct_count and total_downline for all nodes.
   */
  private async recalculateCounters(em?: EntityManager): Promise<void> {
    const manager = em || this.defaultEm;
    const allNodes = await manager.find(NetworkNode);

    for (const node of allNodes) {
      // Direct count: nodes whose sponsor_id === this node's user_id
      const directCount = allNodes.filter(n => n.sponsor_id === node.user_id).length;

      // Total downline: all nodes whose upline_path contains this node's user_id
      const totalDownline = allNodes.filter(n => {
        const path = this.parsePath(n.upline_path);
        return path.includes(node.user_id);
      }).length;

      node.direct_count = directCount;
      node.total_downline = totalDownline;
      node.updated_at = new Date();
      await manager.save(NetworkNode, node);
    }
  }

  /**
   * Get the upline path for a user.
   */
  async getUplinePath(userId: string): Promise<string[]> {
    const node = await this.nodeRepo.findOne({ where: { user_id: userId } });
    if (!node) {
      throw new NetworkNodeNotFoundException(userId);
    }
    return this.parsePath(node.upline_path);
  }

  /**
   * Get all downline nodes for a user.
   * Uses LIKE pattern for SQLite + PostgreSQL compatibility.
   */
  async getDownline(userId: string, maxDepth?: number): Promise<NetworkNode[]> {
    const qb = this.nodeRepo
      .createQueryBuilder('nn')
      .where('nn.upline_path LIKE :pattern', { pattern: `%${userId}%` });

    const nodes = await qb.getMany();

    if (maxDepth) {
      // Filter by relative depth from the user
      const userNode = await this.nodeRepo.findOne({ where: { user_id: userId } });
      const userDepth = userNode ? userNode.depth : 0;
      return nodes.filter(n => n.depth <= userDepth + maxDepth);
    }

    return nodes;
  }

  /**
   * Get direct recruits: nodes where sponsor_id matches userId.
   */
  async getDirectRecruits(userId: string): Promise<NetworkNode[]> {
    return this.nodeRepo.find({ where: { sponsor_id: userId } });
  }

  /**
   * Apply a graph correction — update network_nodes after a sponsor change.
   *
   * PHASE 3 GRAPH CORRECTION NOTE:
   * This method corrects the COMPUTED GRAPH STATE (network_nodes).
   * The SOURCE OF TRUTH for the sponsor relationship is sponsorship_links (Phase 2).
   * To correct the actual sponsor record, call: POST /admin/referrals/:userId/correct
   * These two corrections should be run together. Running only one will create drift
   * between sponsorship_links and network_nodes until the next graph rebuild.
   */
  async applyGraphCorrection(
    dto: GraphCorrectionDto,
    actorId: string,
    em: EntityManager,
  ): Promise<GraphCorrectionLog> {
    // Validate userId !== newSponsorId
    if (dto.userId === dto.newSponsorId) {
      throw new BadRequestException('Cannot assign a user as their own sponsor');
    }

    // Load current node
    const currentNode = await em.findOne(NetworkNode, { where: { user_id: dto.userId } });
    if (!currentNode) {
      throw new NetworkNodeNotFoundException(dto.userId);
    }

    // Load new sponsor's node to get its upline path
    const newSponsorNode = await em.findOne(NetworkNode, { where: { user_id: dto.newSponsorId } });
    const newSponsorUplinePath = newSponsorNode
      ? this.parsePath(newSponsorNode.upline_path)
      : [];

    // Compute new upline for the user
    const newUplinePath = [...newSponsorUplinePath, dto.newSponsorId];

    // Cycle detection
    if (this.detectCycle(dto.userId, newUplinePath)) {
      throw new NetworkCycleException(dto.userId);
    }

    const oldSponsorId = currentNode.sponsor_id;
    const oldUplinePath = this.parsePath(currentNode.upline_path);

    // Update user's node
    currentNode.sponsor_id = dto.newSponsorId;
    currentNode.upline_path = process.env.NODE_ENV === 'test'
      ? (JSON.stringify(newUplinePath) as any)
      : newUplinePath;
    currentNode.depth = newUplinePath.length;
    currentNode.updated_at = new Date();
    await em.save(NetworkNode, currentNode);

    // Cascade rebuild all descendants
    const descendants = await em
      .createQueryBuilder(NetworkNode, 'nn')
      .where('nn.upline_path LIKE :pattern', { pattern: `%${dto.userId}%` })
      .getMany();

    for (const desc of descendants) {
      const descPath = this.parsePath(desc.upline_path);
      // Find where the corrected userId is in the descendant's path
      const idx = descPath.indexOf(dto.userId);
      if (idx >= 0) {
        // Replace everything before (and including) userId with new path
        const suffixAfterUser = descPath.slice(idx + 1);
        const updatedPath = [...newUplinePath, dto.userId, ...suffixAfterUser];
        desc.upline_path = process.env.NODE_ENV === 'test'
          ? (JSON.stringify(updatedPath) as any)
          : updatedPath;
        desc.depth = updatedPath.length;
        desc.updated_at = new Date();
        await em.save(NetworkNode, desc);
      }
    }

    // Recalculate direct_count / total_downline for affected ancestors
    await this.recalculateCounters(em);

    // Write GraphCorrectionLog
    const correctionLog = em.create(GraphCorrectionLog, {
      user_id: dto.userId,
      correction_type: 'sponsor_reassignment',
      old_sponsor_id: oldSponsorId,
      new_sponsor_id: dto.newSponsorId,
      old_upline_path: process.env.NODE_ENV === 'test'
        ? (JSON.stringify(oldUplinePath) as any)
        : oldUplinePath,
      new_upline_path: process.env.NODE_ENV === 'test'
        ? (JSON.stringify(newUplinePath) as any)
        : newUplinePath,
      reason: dto.reason,
      actor_id: actorId,
      created_at: new Date(),
    });
    await em.save(GraphCorrectionLog, correctionLog);

    // Write QualificationEvent (trigger_source: 'correction_flow')
    const qualEvent = em.create(QualificationEvent, {
      user_id: dto.userId,
      event_type: 'disqualified',
      previous_state: process.env.NODE_ENV === 'test'
        ? (JSON.stringify({ sponsor_id: oldSponsorId }) as any)
        : { sponsor_id: oldSponsorId },
      new_state: process.env.NODE_ENV === 'test'
        ? (JSON.stringify({ sponsor_id: dto.newSponsorId }) as any)
        : { sponsor_id: dto.newSponsorId },
      trigger_source: 'correction_flow',
      actor_id: actorId,
      created_at: new Date(),
    });
    await em.save(QualificationEvent, qualEvent);

    // Write OnboardingAuditLog (action: 'admin_network_correction')
    const auditLog = em.create(OnboardingAuditLog, {
      actor_id: actorId,
      action: 'admin_network_correction',
      target_type: 'network_node',
      target_id: dto.userId,
      metadata: process.env.NODE_ENV === 'test'
        ? (JSON.stringify({
            old_sponsor_id: oldSponsorId,
            new_sponsor_id: dto.newSponsorId,
            reason: dto.reason,
          }) as any)
        : {
            old_sponsor_id: oldSponsorId,
            new_sponsor_id: dto.newSponsorId,
            reason: dto.reason,
          },
    });
    await em.save(OnboardingAuditLog, auditLog);

    return correctionLog;
  }

  /**
   * Take a snapshot of the current full graph state.
   */
  async takeSnapshot(
    type: string,
    actorId: string | null,
    em?: EntityManager,
  ): Promise<NetworkSnapshot> {
    const manager = em || this.defaultEm;
    const allNodes = await manager.find(NetworkNode);

    const snapshot = manager.create(NetworkSnapshot, {
      snapshot_type: type,
      user_count: allNodes.length,
      snapshot_data: JSON.stringify(allNodes),
      triggered_by: actorId ? 'admin_manual' : 'system_schedule',
      actor_id: actorId,
      created_at: new Date(),
    });

    return manager.save(NetworkSnapshot, snapshot);
  }
}
