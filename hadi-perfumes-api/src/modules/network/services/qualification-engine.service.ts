import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { QualificationRule } from '../entities/qualification-rule.entity';
import { QualificationState } from '../entities/qualification-state.entity';
import { QualificationEvent } from '../entities/qualification-event.entity';
import { User } from '../../user/entities/user.entity';
import { QualificationContext } from '../interfaces/qualification-context.interface';
import { QualificationResult } from '../interfaces/qualification-result.interface';

@Injectable()
export class QualificationEngineService {
  constructor(
    @InjectRepository(QualificationRule)
    private ruleRepo: Repository<QualificationRule>,
    @InjectRepository(QualificationState)
    private stateRepo: Repository<QualificationState>,
    @InjectRepository(QualificationEvent)
    private eventRepo: Repository<QualificationEvent>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectEntityManager()
    private defaultEm: EntityManager,
  ) {}

  /**
   * Evaluate whether a user is active and qualified based on QualificationRule entities
   * from the specified CompensationPolicyVersion.
   *
   * NEVER compute qualification from recruitment count alone.
   * NEVER hardcode thresholds — always read from QualificationRule entities.
   *
   * Volume sources: Phase 3 has no order data. Accept volume via QualificationContext.
   * Default to 0 unless test data overrides. Phase 6 will call with real volumes.
   */
  async evaluateUser(
    userId: string,
    context: QualificationContext,
    policyVersionId: string,
    em?: EntityManager,
  ): Promise<QualificationResult> {
    const manager = em || this.defaultEm;

    // Load all QualificationRule records for the policy version
    const rules = await manager.find(QualificationRule, {
      where: { policy_version_id: policyVersionId },
    });

    const failedRules: string[] = [];

    // Evaluate each mandatory rule against the context
    for (const rule of rules) {
      const threshold = Number(rule.threshold_value);

      if (rule.is_mandatory) {
        let passed = false;

        switch (rule.rule_type) {
          case 'personal_volume':
            passed = context.personalVolume >= threshold;
            break;
          case 'downline_volume':
            passed = context.downlineVolume >= threshold;
            break;
          case 'active_legs':
            passed = context.activeLegCount >= threshold;
            break;
          default:
            // Unknown rule type — treat as failed for safety
            passed = false;
            break;
        }

        if (!passed) {
          failedRules.push(rule.rule_key);
        }
      }
    }

    const isActive = failedRules.length === 0;
    // Phase 3: isQualified = isActive. Phase 6 adds additional checks.
    const isQualified = isActive;
    const evaluatedAt = new Date();

    // Load previous QualificationState for user
    let prevState = await manager.findOne(QualificationState, {
      where: { user_id: userId },
    });

    const stateChanged = !prevState ||
      prevState.is_active !== isActive ||
      prevState.is_qualified !== isQualified;

    const now = new Date();

    // Upsert QualificationState (one row per user — UNIQUE constraint on user_id)
    if (!prevState) {
      prevState = manager.create(QualificationState, {
        user_id: userId,
        is_active: isActive,
        is_qualified: isQualified,
        personal_volume: context.personalVolume,
        downline_volume: context.downlineVolume,
        active_legs_count: context.activeLegCount,
        policy_version_id: policyVersionId,
        evaluated_at: evaluatedAt,
        created_at: now,
        updated_at: now,
      });
    } else {
      const prevStateSnapshot = {
        is_active: prevState.is_active,
        is_qualified: prevState.is_qualified,
        personal_volume: prevState.personal_volume,
        downline_volume: prevState.downline_volume,
      };

      prevState.is_active = isActive;
      prevState.is_qualified = isQualified;
      prevState.personal_volume = context.personalVolume;
      prevState.downline_volume = context.downlineVolume;
      prevState.active_legs_count = context.activeLegCount;
      prevState.policy_version_id = policyVersionId;
      prevState.evaluated_at = evaluatedAt;
      prevState.updated_at = now;

      // Write QualificationEvent only when state changes
      if (stateChanged) {
        const eventType = isActive ? 'activated' : 'deactivated';
        const event = manager.create(QualificationEvent, {
          user_id: userId,
          event_type: eventType,
          previous_state: process.env.NODE_ENV === 'test'
            ? (JSON.stringify(prevStateSnapshot) as any)
            : prevStateSnapshot,
          new_state: process.env.NODE_ENV === 'test'
            ? (JSON.stringify({
                is_active: isActive,
                is_qualified: isQualified,
                personal_volume: context.personalVolume,
                downline_volume: context.downlineVolume,
              }) as any)
            : {
                is_active: isActive,
                is_qualified: isQualified,
                personal_volume: context.personalVolume,
                downline_volume: context.downlineVolume,
              },
          trigger_source: 'recalc_job',
          policy_version_id: policyVersionId,
          created_at: now,
        });
        await manager.save(QualificationEvent, event);
      }
    }

    await manager.save(QualificationState, prevState);

    return {
      isActive,
      isQualified,
      currentRankLevel: null, // Rank determined separately by RankAssignmentService
      failedRules,
      policyVersionId,
      evaluatedAt,
    };
  }

  /**
   * Recalculate qualification for all users against the active policy version.
   * Returns count of processed and changed users.
   */
  async recalculateAll(
    actorId: string | null,
    policyVersionId: string,
  ): Promise<{ processed: number; changed: number }> {
    const users = await this.userRepo.find({ select: ['id'] });
    let changed = 0;

    for (const user of users) {
      // Phase 3: no order data, all volumes default to 0
      const context: QualificationContext = {
        personalVolume: 0,
        downlineVolume: 0,
        activeLegCount: 0,
      };

      // Load previous state to determine if it changed
      const prevState = await this.stateRepo.findOne({
        where: { user_id: user.id },
      });
      const prevIsActive = prevState?.is_active ?? null;

      const result = await this.evaluateUser(
        user.id,
        context,
        policyVersionId,
      );

      if (prevIsActive !== result.isActive) {
        changed++;
      }
    }

    return { processed: users.length, changed };
  }

  /**
   * Admin: suspend a user's qualification manually.
   */
  async suspendUserQualification(
    userId: string,
    reason: string,
    actorId: string,
  ): Promise<void> {
    const now = new Date();

    // Load or create QualificationState
    let state = await this.stateRepo.findOne({ where: { user_id: userId } });
    if (!state) {
      state = this.stateRepo.create({
        user_id: userId,
        is_active: false,
        is_qualified: false,
        disqualified_reason: reason,
        created_at: now,
        updated_at: now,
        evaluated_at: now,
      });
    } else {
      state.is_active = false;
      state.is_qualified = false;
      state.disqualified_reason = reason;
      state.updated_at = now;
    }

    await this.stateRepo.save(state);

    // Write QualificationEvent
    const event = this.eventRepo.create({
      user_id: userId,
      event_type: 'suspended',
      new_state: process.env.NODE_ENV === 'test'
        ? (JSON.stringify({ is_active: false, disqualified_reason: reason }) as any)
        : { is_active: false, disqualified_reason: reason },
      trigger_source: 'admin_manual',
      actor_id: actorId,
      created_at: now,
    });
    await this.eventRepo.save(event);
  }

  /**
   * Admin: restore a user's qualification.
   */
  async restoreUserQualification(
    userId: string,
    actorId: string,
  ): Promise<void> {
    const now = new Date();

    const state = await this.stateRepo.findOne({ where: { user_id: userId } });
    if (!state) {
      throw new Error(`No qualification state found for user ${userId}`);
    }

    state.disqualified_reason = null;
    state.is_active = true;
    state.is_qualified = true;
    state.updated_at = now;
    await this.stateRepo.save(state);

    // Write QualificationEvent
    const event = this.eventRepo.create({
      user_id: userId,
      event_type: 'restored',
      new_state: process.env.NODE_ENV === 'test'
        ? (JSON.stringify({ is_active: true, is_qualified: true }) as any)
        : { is_active: true, is_qualified: true },
      trigger_source: 'admin_manual',
      actor_id: actorId,
      created_at: now,
    });
    await this.eventRepo.save(event);
  }

  /**
   * Get current qualification state for a user.
   */
  async getCurrentState(userId: string): Promise<QualificationState | null> {
    return this.stateRepo.findOne({ where: { user_id: userId } });
  }
}
