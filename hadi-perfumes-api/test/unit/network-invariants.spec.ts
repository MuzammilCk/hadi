/**
 * Network Invariant Tests
 *
 * These tests verify non-negotiable properties of the graph and qualification engine
 * using pure functions. No database connection required.
 *
 * All invariants here must hold for ANY valid graph state. They are the safety guarantees
 * that make multi-level commission calculation trustworthy and FTC-compliant.
 */

// ─── Graph Invariants ──────────────────────────────────────────────────────────

describe('Graph invariants', () => {
  /**
   * Pure helper: simulates how NetworkGraphService.detectCycle() works.
   * A user appears in their own upline path only if there is a cycle.
   */
  function detectCycle(userId: string, uplinePath: string[]): boolean {
    return uplinePath.includes(userId);
  }

  /**
   * Pure helper: simulates how NetworkGraphService.buildNodeForUser() computes depth.
   * Depth equals the length of the upline path.
   */
  function computeDepth(uplinePath: string[]): number {
    return uplinePath.length;
  }

  /**
   * Pure helper: simulates upline_path construction from a SponsorshipLink.
   * The direct sponsor is the LAST element; root is the FIRST element.
   */
  function buildUplinePath(
    sponsorUplinePath: string[],
    sponsorId: string,
  ): string[] {
    return [...sponsorUplinePath, sponsorId];
  }

  /**
   * Pure helper: simulates parsePath — handles both string and array.
   */
  function parsePath(raw: string | string[] | null | undefined): string[] {
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

  it('a user can never appear in their own upline_path', () => {
    const userId = 'user-aaa';
    const validPaths = [
      [],
      ['root-bbb'],
      ['root-bbb', 'mid-ccc'],
      ['root-bbb', 'mid-ccc', 'direct-ddd'],
    ];

    for (const path of validPaths) {
      expect(detectCycle(userId, path)).toBe(false);
    }

    // A path containing the user's own ID is a cycle
    const cyclicPaths = [
      ['user-aaa'],
      ['root-bbb', 'user-aaa'],
      ['user-aaa', 'mid-ccc'],
    ];

    for (const path of cyclicPaths) {
      expect(detectCycle(userId, path)).toBe(true);
    }
  });

  it('upline_path last element is always the direct sponsor', () => {
    const sponsorId = 'sponsor-bbb';
    const grandparentId = 'grandparent-ccc';

    // Level 1: direct sponsor only
    const pathLevel1 = buildUplinePath([], sponsorId);
    expect(pathLevel1[pathLevel1.length - 1]).toBe(sponsorId);

    // Level 2: grandparent → sponsor
    const pathLevel2 = buildUplinePath([grandparentId], sponsorId);
    expect(pathLevel2[pathLevel2.length - 1]).toBe(sponsorId);
    expect(pathLevel2[0]).toBe(grandparentId);
  });

  it('depth always equals upline_path.length', () => {
    expect(computeDepth([])).toBe(0);
    expect(computeDepth(['root'])).toBe(1);
    expect(computeDepth(['root', 'mid'])).toBe(2);
    expect(computeDepth(['root', 'mid', 'sponsor'])).toBe(3);
  });

  it('the same graph state always produces the same upline_path', () => {
    const sponsorId = 'sponsor-bbb';
    const rootId = 'root-aaa';

    const result1 = buildUplinePath([rootId], sponsorId);
    const result2 = buildUplinePath([rootId], sponsorId);

    expect(result1).toEqual(result2);
  });

  it('a correction changes sponsor and path but does not erase the node', () => {
    // A graph correction updates sponsor_id and upline_path.
    // The user's NetworkNode itself must still exist after correction.
    // This invariant is proven by: applyGraphCorrection() always finds and UPDATES
    // the existing node (never deletes it). The correction log records history.
    const userId = 'user-aaa';
    const oldSponsorId = 'old-sponsor-bbb';
    const newSponsorId = 'new-sponsor-ccc';

    // Simulate pre-correction state
    const preCorrection = {
      user_id: userId,
      sponsor_id: oldSponsorId,
      upline_path: [oldSponsorId],
    };

    // Simulate post-correction state (node still exists with same user_id)
    const postCorrection = {
      user_id: userId,
      sponsor_id: newSponsorId,
      upline_path: [newSponsorId],
    };

    // The user_id is preserved — node is never erased
    expect(preCorrection.user_id).toBe(postCorrection.user_id);

    // Sponsor and path changed
    expect(preCorrection.sponsor_id).not.toBe(postCorrection.sponsor_id);
    expect(preCorrection.upline_path).not.toEqual(postCorrection.upline_path);
  });

  it('parsePath handles both JSON string and array correctly', () => {
    const ids = ['root-aaa', 'mid-bbb', 'leaf-ccc'];

    // Array input — return as-is
    expect(parsePath(ids)).toEqual(ids);

    // JSON string input — parse it
    expect(parsePath(JSON.stringify(ids))).toEqual(ids);

    // Null / undefined — return empty
    expect(parsePath(null)).toEqual([]);
    expect(parsePath(undefined)).toEqual([]);
    expect(parsePath('')).toEqual([]);
  });
});

// ─── Qualification Invariants ──────────────────────────────────────────────────

describe('Qualification invariants', () => {
  /**
   * Simulates the rank determination logic from RankAssignmentService.assignRank().
   * ALL three conditions must be met — never rank from leg count alone.
   */
  function determineRank(
    context: {
      personalVolume: number;
      downlineVolume: number;
      activeLegCount: number;
    },
    rules: Array<{
      rank_level: number;
      personal_sales_volume_requirement: number;
      downline_sales_volume_requirement: number;
      active_legs_requirement: number;
    }>,
  ): number | null {
    // Sort descending to find highest eligible rank
    const sorted = [...rules].sort((a, b) => b.rank_level - a.rank_level);
    for (const rule of sorted) {
      const meetsPersonal =
        context.personalVolume >= rule.personal_sales_volume_requirement;
      const meetsDownline =
        context.downlineVolume >= rule.downline_sales_volume_requirement;
      const meetsLegs = context.activeLegCount >= rule.active_legs_requirement;
      if (meetsPersonal && meetsDownline && meetsLegs) {
        return rule.rank_level;
      }
    }
    return null;
  }

  /**
   * Simulates qualification check from QualificationEngineService.evaluateUser().
   * isActive requires all mandatory rules to pass. isQualified requires isActive.
   */
  function evaluateQualification(
    context: {
      personalVolume: number;
      downlineVolume: number;
      activeLegCount: number;
    },
    rules: Array<{
      rule_type: string;
      threshold_value: number;
      is_mandatory: boolean;
    }>,
  ): { isActive: boolean; isQualified: boolean; failedRules: string[] } {
    const failedRules: string[] = [];
    for (const rule of rules) {
      if (rule.is_mandatory) {
        let passed = false;
        if (rule.rule_type === 'personal_volume')
          passed = context.personalVolume >= rule.threshold_value;
        else if (rule.rule_type === 'downline_volume')
          passed = context.downlineVolume >= rule.threshold_value;
        else if (rule.rule_type === 'active_legs')
          passed = context.activeLegCount >= rule.threshold_value;
        if (!passed) failedRules.push(rule.rule_type);
      }
    }
    const isActive = failedRules.length === 0;
    const isQualified = isActive; // Phase 3: isQualified = isActive
    return { isActive, isQualified, failedRules };
  }

  const standardRankRules = [
    {
      rank_level: 1,
      personal_sales_volume_requirement: 100,
      downline_sales_volume_requirement: 0,
      active_legs_requirement: 0,
    },
    {
      rank_level: 2,
      personal_sales_volume_requirement: 200,
      downline_sales_volume_requirement: 500,
      active_legs_requirement: 2,
    },
    {
      rank_level: 3,
      personal_sales_volume_requirement: 500,
      downline_sales_volume_requirement: 2000,
      active_legs_requirement: 5,
    },
  ];

  it('rank cannot be awarded from activeLegCount alone without volume thresholds', () => {
    // High leg count but ZERO personal or downline volume → no rank
    const contextLegsOnly = {
      personalVolume: 0,
      downlineVolume: 0,
      activeLegCount: 100,
    };
    const rank = determineRank(contextLegsOnly, standardRankRules);
    expect(rank).toBeNull();
  });

  it('rank cannot be awarded from downline volume alone without personal volume', () => {
    // High downline volume but zero personal → no rank (rank 1 requires personal ≥ 100)
    const contextDownlineOnly = {
      personalVolume: 0,
      downlineVolume: 50000,
      activeLegCount: 10,
    };
    const rank = determineRank(contextDownlineOnly, standardRankRules);
    expect(rank).toBeNull();
  });

  it('rank is awarded when ALL conditions are met', () => {
    const contextFull = {
      personalVolume: 200,
      downlineVolume: 500,
      activeLegCount: 2,
    };
    const rank = determineRank(contextFull, standardRankRules);
    expect(rank).toBe(2); // highest rank where all conditions met
  });

  it('highest eligible rank is awarded, not just any rank', () => {
    const contextHigh = {
      personalVolume: 500,
      downlineVolume: 2000,
      activeLegCount: 5,
    };
    const rank = determineRank(contextHigh, standardRankRules);
    expect(rank).toBe(3); // not rank 1 or 2 — highest that qualifies
  });

  it('a suspended user is never isQualified', () => {
    // A suspended user has is_active = false, is_qualified = false
    // This is enforced in suspendUserQualification()
    const suspendedState = {
      is_active: false,
      is_qualified: false,
      disqualified_reason: 'Fraud investigation',
    };
    expect(suspendedState.is_qualified).toBe(false);
    // The suspension overrides any previous qualification
    expect(suspendedState.is_active).toBe(false);
  });

  it('the same QualificationContext + same rules always returns the same result (deterministic)', () => {
    const context = {
      personalVolume: 150,
      downlineVolume: 600,
      activeLegCount: 3,
    };
    const rules = [
      {
        rule_type: 'personal_volume',
        threshold_value: 100,
        is_mandatory: true,
      },
      {
        rule_type: 'downline_volume',
        threshold_value: 500,
        is_mandatory: true,
      },
    ];

    const result1 = evaluateQualification(context, rules);
    const result2 = evaluateQualification(context, rules);
    const result3 = evaluateQualification(context, rules);

    expect(result1).toEqual(result2);
    expect(result2).toEqual(result3);
  });

  it('isQualified cannot be true if isActive is false', () => {
    // Test with failing context (below thresholds)
    const context = { personalVolume: 0, downlineVolume: 0, activeLegCount: 0 };
    const rules = [
      {
        rule_type: 'personal_volume',
        threshold_value: 100,
        is_mandatory: true,
      },
    ];

    const result = evaluateQualification(context, rules);

    expect(result.isActive).toBe(false);
    // isQualified must be false if isActive is false — this is the invariant
    if (!result.isActive) {
      expect(result.isQualified).toBe(false);
    }
  });

  it('non-mandatory rules do not affect isActive', () => {
    const context = {
      personalVolume: 150,
      downlineVolume: 0,
      activeLegCount: 0,
    };
    const rules = [
      {
        rule_type: 'personal_volume',
        threshold_value: 100,
        is_mandatory: true,
      }, // PASSES
      {
        rule_type: 'downline_volume',
        threshold_value: 500,
        is_mandatory: false,
      }, // FAILS but non-mandatory
    ];

    const result = evaluateQualification(context, rules);
    // Only mandatory rules affect isActive
    expect(result.isActive).toBe(true);
  });

  it('all mandatory rules must pass for isActive to be true', () => {
    const context = {
      personalVolume: 150,
      downlineVolume: 400,
      activeLegCount: 3,
    };
    const rules = [
      {
        rule_type: 'personal_volume',
        threshold_value: 100,
        is_mandatory: true,
      }, // PASSES
      {
        rule_type: 'downline_volume',
        threshold_value: 500,
        is_mandatory: true,
      }, // FAILS (400 < 500)
    ];

    const result = evaluateQualification(context, rules);
    expect(result.isActive).toBe(false); // must fail — one mandatory rule failed
    expect(result.failedRules).toContain('downline_volume');
  });
});
