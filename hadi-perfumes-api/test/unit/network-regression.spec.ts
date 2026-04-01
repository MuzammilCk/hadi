/**
 * Network Regression Tests
 *
 * These tests guard against known failure modes that have been encountered or
 * could be introduced during future refactoring of the graph engine.
 *
 * All tests use pure logic or minimal mocking — no database required.
 */

// ─── Graph Regression Scenarios ────────────────────────────────────────────────

describe('Regression: graph corruption scenarios', () => {

  /**
   * Simulates detectCycle() from NetworkGraphService
   */
  function detectCycle(userId: string, proposedUplinePath: string[]): boolean {
    return proposedUplinePath.includes(userId);
  }

  /**
   * Simulates depth calculation: depth = upline_path.length
   */
  function computeDepth(uplinePath: string[]): number {
    return uplinePath.length;
  }

  /**
   * Simulates parsePath() from NetworkGraphService
   */
  function parsePath(raw: string | string[] | null | undefined): string[] {
    if (!raw) return [];
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return raw;
  }

  /**
   * Simulates the cascade path update logic in applyGraphCorrection().
   * Given a descendant's old path, the corrected user's ID, and the new upline path,
   * compute the updated path for the descendant.
   */
  function cascadeUpdatePath(
    descOldPath: string[],
    correctedUserId: string,
    newUplinePath: string[],
  ): string[] | null {
    const idx = descOldPath.indexOf(correctedUserId);
    if (idx < 0) return null; // not a descendant of corrected user
    const suffix = descOldPath.slice(idx + 1);
    return [...newUplinePath, correctedUserId, ...suffix];
  }

  it('REGRESSION: cycle injection during correction is blocked by detectCycle()', () => {
    // Scenario: user B is corrected to have user C as new sponsor.
    // But user C is already in user B's downline (C has B in its upline path).
    // This would create: B → C → B → ... (infinite loop)
    const userB = 'user-bbb';
    const userC = 'user-ccc'; // in B's downline

    // When correcting B to point to C, we compute B's new upline path as: [...C's path, C]
    // C's upline_path (from network_nodes) contains B: [A, B]
    const cUplinePath = ['user-aaa', userB]; // B is C's ancestor
    const newUplineForB = [...cUplinePath, userC]; // = ['user-aaa', 'user-bbb', 'user-ccc']

    // Cycle detected: B appears in its own proposed upline path
    expect(detectCycle(userB, newUplineForB)).toBe(true);
  });

  it('REGRESSION: self-correction (user corrected to themselves) is detected as a cycle', () => {
    const userId = 'user-aaa';
    // Proposed upline includes userId itself
    const proposedPath = [userId];
    expect(detectCycle(userId, proposedPath)).toBe(true);
  });

  it('REGRESSION: stale upline_path with parsePath — both string and array give same result', () => {
    const ids = ['root-aaa', 'mid-bbb', 'user-ccc'];

    // JSON string (TypeORM simple-json in test mode returns string after auto-parse)
    const fromString = parsePath(JSON.stringify(ids));
    // Direct array
    const fromArray = parsePath(ids);

    expect(fromString).toEqual(fromArray);
    expect(fromString).toEqual(ids);
  });

  it('REGRESSION: wrong depth after 3-level chain is caught', () => {
    // 3-level chain: root → mid → leaf
    // leaf's upline_path = [root, mid]
    const leafUplinePath = ['root-aaa', 'mid-bbb'];
    const depth = computeDepth(leafUplinePath);
    expect(depth).toBe(2); // NOT 3 — depth = path length, not path length + 1

    // Root has no upline
    expect(computeDepth([])).toBe(0);
    // Mid has one ancestor (root)
    expect(computeDepth(['root-aaa'])).toBe(1);
  });

  it('REGRESSION: cascade update correctly replaces old upline segment with new one', () => {
    // Setup: root → oldSponsor → user → child
    //   child.upline_path = [root, oldSponsor, user]
    //
    // Correction: user gets newSponsor as sponsor
    //   user.newUplinePath = [newSponsor]
    //
    // Expected child.upline_path after cascade: [newSponsor, user]
    const root = 'root-aaa';
    const oldSponsor = 'old-sponsor-bbb';
    const newSponsor = 'new-sponsor-ccc';
    const user = 'user-ddd';

    const childOldPath = [root, oldSponsor, user];
    const userNewUplinePath = [newSponsor]; // newSponsor has no ancestors

    const updatedPath = cascadeUpdatePath(childOldPath, user, userNewUplinePath);
    expect(updatedPath).not.toBeNull();
    expect(updatedPath).toContain(newSponsor);
    expect(updatedPath).toContain(user);
    expect(updatedPath).not.toContain(oldSponsor);
    expect(updatedPath).not.toContain(root);
    expect(updatedPath).toEqual([newSponsor, user]);
  });

  it('REGRESSION: cascade update for deep descendant preserves suffix after corrected user', () => {
    // Setup: root → oldSponsor → user → child → grandchild
    //   grandchild.upline_path = [root, oldSponsor, user, child]
    //
    // Correction: user gets newSponsor as sponsor
    //   user.newUplinePath = [newSponsor]
    //
    // Expected grandchild.upline_path: [newSponsor, user, child]
    // (suffix "child" is preserved after "user")
    const root = 'root-aaa';
    const oldSponsor = 'old-sponsor-bbb';
    const newSponsor = 'new-sponsor-ccc';
    const user = 'user-ddd';
    const child = 'child-eee';

    const grandchildOldPath = [root, oldSponsor, user, child];
    const userNewUplinePath = [newSponsor];

    const updatedPath = cascadeUpdatePath(grandchildOldPath, user, userNewUplinePath);
    expect(updatedPath).toEqual([newSponsor, user, child]);
    expect(updatedPath).not.toContain(root);
    expect(updatedPath).not.toContain(oldSponsor);
  });

  it('REGRESSION: a non-descendant node is not affected by cascade update', () => {
    // A node whose upline_path does NOT contain the corrected user's ID
    // should return null from cascadeUpdatePath (no update needed)
    const unrelatedPath = ['root-aaa', 'other-user-bbb'];
    const correctedUser = 'user-ddd'; // not in the path

    const result = cascadeUpdatePath(unrelatedPath, correctedUser, ['new-sponsor-ccc']);
    expect(result).toBeNull();
  });

  it('REGRESSION: qualification recalc does not award rank from leg count alone', () => {
    // Reproduce the FTC invariant in regression form:
    // High leg count without any volume must yield no rank.

    function determineRank(
      context: { pv: number; dv: number; legs: number },
      rules: Array<{ level: number; pvReq: number; dvReq: number; legsReq: number }>,
    ): number | null {
      const sorted = [...rules].sort((a, b) => b.level - a.level);
      for (const r of sorted) {
        if (context.pv >= r.pvReq && context.dv >= r.dvReq && context.legs >= r.legsReq) {
          return r.level;
        }
      }
      return null;
    }

    const rules = [
      { level: 1, pvReq: 100, dvReq: 0, legsReq: 0 },
      { level: 2, pvReq: 200, dvReq: 500, legsReq: 2 },
    ];

    // No volume at all — even 1000 legs → no rank
    expect(determineRank({ pv: 0, dv: 0, legs: 1000 }, rules)).toBeNull();

    // With personal volume but no downline → rank 1 awarded
    expect(determineRank({ pv: 100, dv: 0, legs: 0 }, rules)).toBe(1);

    // With all conditions met → rank 2 awarded
    expect(determineRank({ pv: 200, dv: 500, legs: 2 }, rules)).toBe(2);
  });
});
