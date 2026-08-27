import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager, IsNull } from 'typeorm';
import { RankAssignment } from '../entities/rank-assignment.entity';
import { QualificationEvent } from '../entities/qualification-event.entity';
import { RankRule } from '../../commission/entities/rank-rule.entity';
import { QualificationContext } from '../interfaces/qualification-context.interface';

@Injectable()
export class RankAssignmentService {
  constructor(
    @InjectRepository(RankAssignment)
    private rankAssignmentRepo: Repository<RankAssignment>,
    @InjectRepository(QualificationEvent)
    private qualEventRepo: Repository<QualificationEvent>,
    @InjectEntityManager()
    private defaultEm: EntityManager,
  ) {}

  /**
   * Determine and assign the highest eligible rank for a user.
   *
   * Rank determination rule:
   * Find the highest RankRule.rank_level where ALL three conditions are met:
   *   context.personalVolume >= rankRule.personal_sales_volume_requirement
   *   context.downlineVolume >= rankRule.downline_sales_volume_requirement
   *   context.activeLegCount >= rankRule.active_legs_requirement
   *
   * NEVER award rank from activeLegCount alone — volume thresholds are required.
   */
  async assignRank(
    userId: string,
    context: QualificationContext,
    rankRules: RankRule[],
    policyVersionId: string,
    actorId: string | null,
    em?: EntityManager,
  ): Promise<RankAssignment | null> {
    const manager = em || this.defaultEm;

    // Sort by rank_level descending to find the highest eligible first
    const sortedRules = [...rankRules].sort(
      (a, b) => Number(b.rank_level) - Number(a.rank_level),
    );

    // Find the highest qualifying rank
    let qualifiedRule: RankRule | null = null;
    for (const rule of sortedRules) {
      const meetsPersonal =
        context.personalVolume >=
        Number(rule.personal_sales_volume_requirement);
      const meetsDownline =
        context.downlineVolume >=
        Number(rule.downline_sales_volume_requirement);
      const meetsLegs =
        context.activeLegCount >= Number(rule.active_legs_requirement);

      if (meetsPersonal && meetsDownline && meetsLegs) {
        qualifiedRule = rule;
        break;
      }
    }

    // Load current active rank (revoked_at IS NULL)
    const currentRank = await manager.findOne(RankAssignment, {
      where: { user_id: userId, revoked_at: IsNull() },
    });

    const now = new Date();

    if (!qualifiedRule) {
      // No rank earned — revoke current if exists
      if (currentRank) {
        currentRank.revoked_at = now;
        await manager.save(RankAssignment, currentRank);

        // Write rank_changed event
        const event = manager.create(QualificationEvent, {
          user_id: userId,
          event_type: 'rank_changed',
          previous_state:
            process.env.NODE_ENV === 'test'
              ? (JSON.stringify({
                  rank_rule_id: currentRank.rank_rule_id,
                }) as any)
              : { rank_rule_id: currentRank.rank_rule_id },
          new_state:
            process.env.NODE_ENV === 'test'
              ? (JSON.stringify({ rank_rule_id: null }) as any)
              : { rank_rule_id: null },
          trigger_source: 'recalc_job',
          policy_version_id: policyVersionId,
          actor_id: actorId,
          created_at: now,
        });
        await manager.save(QualificationEvent, event);
      }
      return null;
    }

    // Same rank — no change needed (idempotent)
    if (currentRank && currentRank.rank_rule_id === qualifiedRule.id) {
      return currentRank;
    }

    // Different rank or new rank
    // Revoke current rank if exists
    if (currentRank) {
      currentRank.revoked_at = now;
      await manager.save(RankAssignment, currentRank);
    }

    // Create new RankAssignment
    const newAssignment = manager.create(RankAssignment, {
      user_id: userId,
      rank_rule_id: qualifiedRule.id,
      assigned_at: now,
      assigned_by: actorId ?? 'system',
      policy_version_id: policyVersionId,
      created_at: now,
    });
    await manager.save(RankAssignment, newAssignment);

    // Write QualificationEvent with event_type: 'rank_changed'
    const event = manager.create(QualificationEvent, {
      user_id: userId,
      event_type: 'rank_changed',
      previous_state:
        process.env.NODE_ENV === 'test'
          ? (JSON.stringify({
              rank_rule_id: currentRank?.rank_rule_id ?? null,
            }) as any)
          : { rank_rule_id: currentRank?.rank_rule_id ?? null },
      new_state:
        process.env.NODE_ENV === 'test'
          ? (JSON.stringify({
              rank_rule_id: qualifiedRule.id,
              rank_name: qualifiedRule.rank_name,
              rank_level: qualifiedRule.rank_level,
            }) as any)
          : {
              rank_rule_id: qualifiedRule.id,
              rank_name: qualifiedRule.rank_name,
              rank_level: qualifiedRule.rank_level,
            },
      trigger_source: 'recalc_job',
      policy_version_id: policyVersionId,
      actor_id: actorId,
      created_at: now,
    });
    await manager.save(QualificationEvent, event);

    return newAssignment;
  }

  /**
   * Get the current active (non-revoked) rank assignment for a user.
   */
  async getCurrentRank(userId: string): Promise<RankAssignment | null> {
    return this.rankAssignmentRepo.findOne({
      where: { user_id: userId, revoked_at: IsNull() },
    });
  }

  /**
   * Get full rank history including revoked assignments, ordered by assigned_at desc.
   */
  async getRankHistory(userId: string): Promise<RankAssignment[]> {
    return this.rankAssignmentRepo.find({
      where: { user_id: userId },
      order: { assigned_at: 'DESC' },
    });
  }
}
