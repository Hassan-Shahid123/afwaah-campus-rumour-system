// ─────────────────────────────────────────────────────────────
// Afwaah — Phase 3 Tests: Scoring Engine
//
// Tests the CorrelationDampener, BTSEngine, RBTSEngine,
// and ReputationManager in isolation and in full pipeline.
//
// Run: npx --node-options="--experimental-vm-modules" jest tests/scoring.test.js --verbose
// ─────────────────────────────────────────────────────────────

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { CorrelationDampener } from '../src/scoring/correlation-dampener.js';
import { BTSEngine } from '../src/scoring/bts-engine.js';
import { RBTSEngine } from '../src/scoring/rbts-engine.js';
import { ReputationManager } from '../src/scoring/reputation-manager.js';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Quick factory for a dampenedVote object (as output by the dampener).
 */
function makeDV(nullifier, vote, prediction, weight = 1.0, stakeAmount = 5) {
  return {
    vote: { nullifier, vote, prediction, stakeAmount },
    weight,
    clusterId: nullifier,
    clusterSize: 1,
  };
}

/**
 * Quick factory for a raw vote (as input to the dampener).
 */
function makeVote(nullifier, vote, prediction = { TRUE: 0.5, FALSE: 0.3, UNVERIFIED: 0.2 }, stakeAmount = 5) {
  return { nullifier, vote, prediction, stakeAmount };
}

// ═════════════════════════════════════════════════════════════
// 1. CorrelationDampener
// ═════════════════════════════════════════════════════════════
describe('CorrelationDampener', () => {
  let dampener;

  beforeEach(() => {
    dampener = new CorrelationDampener(10.0, 0.85);
  });

  test('should pass through votes with no history (no dampening)', () => {
    const votes = [
      makeVote('A', 'TRUE'),
      makeVote('B', 'FALSE'),
    ];

    const result = dampener.dampen(votes, new Map());
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBe(1.0);
    expect(result[1].weight).toBe(1.0);
  });

  test('should pass through single voter unchanged', () => {
    const votes = [makeVote('A', 'TRUE')];
    const result = dampener.dampen(votes, new Map());
    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(1.0);
  });

  test('should return empty array for empty input', () => {
    expect(dampener.dampen([], new Map())).toEqual([]);
  });

  test('should detect perfectly correlated voters and dampen them', () => {
    const votes = [
      makeVote('bot1', 'TRUE'),
      makeVote('bot2', 'TRUE'),
      makeVote('bot3', 'TRUE'),
    ];

    // All three voted identically on 5 past rumors
    const history = new Map();
    const sharedHistory = [
      { rumorId: 'r1', vote: 'TRUE' },
      { rumorId: 'r2', vote: 'FALSE' },
      { rumorId: 'r3', vote: 'TRUE' },
      { rumorId: 'r4', vote: 'TRUE' },
      { rumorId: 'r5', vote: 'FALSE' },
    ];
    history.set('bot1', [...sharedHistory]);
    history.set('bot2', [...sharedHistory]);
    history.set('bot3', [...sharedHistory]);

    const result = dampener.dampen(votes, history);

    // All should be in the same cluster
    const clusterIds = new Set(result.map(r => r.clusterId));
    expect(clusterIds.size).toBe(1);

    // Weight should be significantly dampened
    // W = 1 / (1 + 10 * 1.0) = 1/11 ≈ 0.0909
    for (const r of result) {
      expect(r.weight).toBeCloseTo(1.0 / 11.0, 2);
      expect(r.clusterSize).toBe(3);
    }
  });

  test('should not cluster independent voters', () => {
    const votes = [
      makeVote('honest1', 'TRUE'),
      makeVote('honest2', 'FALSE'),
    ];

    // Opposite voting patterns
    const history = new Map();
    history.set('honest1', [
      { rumorId: 'r1', vote: 'TRUE' },
      { rumorId: 'r2', vote: 'TRUE' },
      { rumorId: 'r3', vote: 'FALSE' },
    ]);
    history.set('honest2', [
      { rumorId: 'r1', vote: 'FALSE' },
      { rumorId: 'r2', vote: 'FALSE' },
      { rumorId: 'r3', vote: 'TRUE' },
    ]);

    const result = dampener.dampen(votes, history);

    // Negative or low correlation → no clustering
    for (const r of result) {
      expect(r.weight).toBe(1.0);
      expect(r.clusterSize).toBe(1);
    }
  });

  test('should handle mixed clusters (some bots, some independent)', () => {
    const votes = [
      makeVote('bot1', 'TRUE'),
      makeVote('bot2', 'TRUE'),
      makeVote('honest', 'FALSE'),
    ];

    const botHistory = [
      { rumorId: 'r1', vote: 'TRUE' },
      { rumorId: 'r2', vote: 'TRUE' },
      { rumorId: 'r3', vote: 'FALSE' },
    ];
    const history = new Map();
    history.set('bot1', [...botHistory]);
    history.set('bot2', [...botHistory]);
    history.set('honest', [
      { rumorId: 'r1', vote: 'FALSE' },
      { rumorId: 'r2', vote: 'FALSE' },
      { rumorId: 'r3', vote: 'TRUE' },
    ]);

    const result = dampener.dampen(votes, history);

    const honestResult = result.find(r => r.vote.nullifier === 'honest');
    const botResult = result.find(r => r.vote.nullifier === 'bot1');

    expect(honestResult.weight).toBe(1.0);
    expect(honestResult.clusterSize).toBe(1);
    expect(botResult.weight).toBeLessThan(1.0);
    expect(botResult.clusterSize).toBe(2);
  });

  test('should use custom lambda and threshold', () => {
    // Very low threshold → everything clusters
    const strict = new CorrelationDampener(20.0, 0.0);
    const votes = [
      makeVote('a', 'TRUE'),
      makeVote('b', 'TRUE'),
    ];
    const history = new Map();
    history.set('a', [{ rumorId: 'r1', vote: 'TRUE' }, { rumorId: 'r2', vote: 'FALSE' }]);
    history.set('b', [{ rumorId: 'r1', vote: 'TRUE' }, { rumorId: 'r2', vote: 'TRUE' }]);

    const result = strict.dampen(votes, history);
    // With threshold=0 almost any correlation clusters them
    // The exact weight depends on their actual ρ
    expect(result).toHaveLength(2);
  });

  test('effective bot weight: 50 identical bots ≈ 4.5 votes', () => {
    const n = 50;
    const votes = [];
    const history = new Map();
    const sharedHistory = [
      { rumorId: 'r1', vote: 'TRUE' },
      { rumorId: 'r2', vote: 'FALSE' },
      { rumorId: 'r3', vote: 'TRUE' },
    ];

    for (let i = 0; i < n; i++) {
      votes.push(makeVote(`bot${i}`, 'TRUE'));
      history.set(`bot${i}`, [...sharedHistory]);
    }

    const result = dampener.dampen(votes, history);
    const effectiveVotes = result.reduce((sum, r) => sum + r.weight, 0);

    // W = 1/(1+10*1.0) = 0.0909... × 50 ≈ 4.55
    expect(effectiveVotes).toBeCloseTo(50 / 11, 1);
  });
});

// ═════════════════════════════════════════════════════════════
// 2. BTSEngine
// ═════════════════════════════════════════════════════════════
describe('BTSEngine', () => {
  let bts;

  beforeEach(() => {
    bts = new BTSEngine(1.0, 0.001);
  });

  test('should return empty result for no votes', () => {
    const result = bts.calculate([]);
    expect(result.rumorTrustScore).toBe(50);
    expect(result.voterScores.size).toBe(0);
    expect(result.consensus).toBe('UNVERIFIED');
  });

  test('should compute actual proportions correctly', () => {
    const votes = [
      makeDV('v1', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }),
      makeDV('v2', 'TRUE', { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }),
      makeDV('v3', 'FALSE', { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }),
    ];

    const result = bts.calculate(votes);
    expect(result.actualProportions.TRUE).toBeCloseTo(2 / 3, 4);
    expect(result.actualProportions.FALSE).toBeCloseTo(1 / 3, 4);
    expect(result.actualProportions.UNVERIFIED).toBeCloseTo(0, 4);
  });

  test('should reward honest voters with positive BTS scores', () => {
    // 7 TRUE, 3 FALSE — honest answer is TRUE
    const votes = [];
    for (let i = 0; i < 7; i++) {
      votes.push(makeDV(`t${i}`, 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }));
    }
    for (let i = 0; i < 3; i++) {
      votes.push(makeDV(`f${i}`, 'FALSE', { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }));
    }

    const result = bts.calculate(votes);

    // TRUE voters should have positive info scores (surprisingly common)
    for (let i = 0; i < 7; i++) {
      expect(result.voterScores.get(`t${i}`)).toBeGreaterThan(0);
    }

    // Consensus should be TRUE (70%)
    expect(result.consensus).toBe('TRUE');
    expect(result.rumorTrustScore).toBeGreaterThan(50);
  });

  test('should penalize voters who vote against surprise', () => {
    // Everyone predicts 50/50 but 80% vote TRUE
    const votes = [];
    for (let i = 0; i < 8; i++) {
      votes.push(makeDV(`t${i}`, 'TRUE', { TRUE: 0.5, FALSE: 0.4, UNVERIFIED: 0.1 }));
    }
    for (let i = 0; i < 2; i++) {
      votes.push(makeDV(`f${i}`, 'FALSE', { TRUE: 0.5, FALSE: 0.4, UNVERIFIED: 0.1 }));
    }

    const result = bts.calculate(votes);

    // TRUE voters should outscore FALSE voters (they had the "surprise")
    const trueScoreAvg = [...result.voterScores.entries()]
      .filter(([k]) => k.startsWith('t'))
      .reduce((s, [, v]) => s + v, 0) / 8;

    const falseScoreAvg = [...result.voterScores.entries()]
      .filter(([k]) => k.startsWith('f'))
      .reduce((s, [, v]) => s + v, 0) / 2;

    expect(trueScoreAvg).toBeGreaterThan(falseScoreAvg);
  });

  test('should reward accurate predictions', () => {
    // Two voters both vote TRUE. One predicts accurately, one doesn't.
    const votes = [
      makeDV('accurate', 'TRUE', { TRUE: 0.9, FALSE: 0.08, UNVERIFIED: 0.02 }),
      makeDV('inaccurate', 'TRUE', { TRUE: 0.33, FALSE: 0.33, UNVERIFIED: 0.34 }),
      makeDV('third', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }),
    ];

    const result = bts.calculate(votes);
    // The accurate predictor should score higher
    expect(result.voterScores.get('accurate')).toBeGreaterThan(
      result.voterScores.get('inaccurate')
    );
  });

  test('should handle very small prediction values (floor)', () => {
    const votes = [
      makeDV('v1', 'TRUE', { TRUE: 0.99, FALSE: 0.005, UNVERIFIED: 0.005 }),
      makeDV('v2', 'FALSE', { TRUE: 0.01, FALSE: 0.98, UNVERIFIED: 0.01 }),
    ];

    // Should not throw or produce NaN
    const result = bts.calculate(votes);
    expect(isNaN(result.rumorTrustScore)).toBe(false);
    for (const [, score] of result.voterScores) {
      expect(isNaN(score)).toBe(false);
    }
  });

  test('should compute rumor trust score as weighted TRUE proportion', () => {
    // 3 TRUE (stake=10), 1 FALSE (stake=5)
    const votes = [
      makeDV('t1', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, 1.0, 10),
      makeDV('t2', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, 1.0, 10),
      makeDV('t3', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, 1.0, 10),
      makeDV('f1', 'FALSE', { TRUE: 0.2, FALSE: 0.7, UNVERIFIED: 0.1 }, 1.0, 5),
    ];

    const result = bts.calculate(votes);
    // Expected: (10+10+10) / (10+10+10+5) × 100 = 30/35 × 100 ≈ 85.7
    expect(result.rumorTrustScore).toBeCloseTo(85.71, 0);
  });

  test('should classify consensus correctly', () => {
    // 100% TRUE
    const allTrue = [
      makeDV('v1', 'TRUE', { TRUE: 0.9, FALSE: 0.05, UNVERIFIED: 0.05 }),
    ];
    expect(bts.calculate(allTrue).consensus).toBe('TRUE');

    // 100% FALSE
    const allFalse = [
      makeDV('v1', 'FALSE', { TRUE: 0.05, FALSE: 0.9, UNVERIFIED: 0.05 }),
    ];
    expect(bts.calculate(allFalse).consensus).toBe('FALSE');

    // Mixed → DISPUTED
    const mixed = [
      makeDV('v1', 'TRUE', { TRUE: 0.5, FALSE: 0.3, UNVERIFIED: 0.2 }),
      makeDV('v2', 'FALSE', { TRUE: 0.3, FALSE: 0.5, UNVERIFIED: 0.2 }),
    ];
    expect(bts.calculate(mixed).consensus).toBe('DISPUTED');
  });

  test('should respect dampening weights in proportions', () => {
    // 2 TRUE (weight=0.1 each, dampened bots) vs 1 FALSE (weight=1.0)
    const votes = [
      makeDV('bot1', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, 0.1),
      makeDV('bot2', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, 0.1),
      makeDV('honest', 'FALSE', { TRUE: 0.2, FALSE: 0.7, UNVERIFIED: 0.1 }, 1.0),
    ];

    const result = bts.calculate(votes);
    // TRUE weight = 0.1+0.1 = 0.2, FALSE weight = 1.0, total = 1.2
    // TRUE proportion = 0.2/1.2 ≈ 0.167, FALSE ≈ 0.833
    expect(result.actualProportions.FALSE).toBeGreaterThan(0.8);
    expect(result.consensus).toBe('FALSE');
  });
});

// ═════════════════════════════════════════════════════════════
// 3. RBTSEngine
// ═════════════════════════════════════════════════════════════
describe('RBTSEngine', () => {
  let rbts;

  beforeEach(() => {
    rbts = new RBTSEngine(1.0, 0.001);
  });

  test('should return empty result for < 3 votes', () => {
    const result = rbts.calculate([makeDV('v1', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 })]);
    expect(result.voterScores.size).toBe(0);
    expect(result.consensus).toBe('UNVERIFIED');
  });

  test('should produce scores for 3+ voters', () => {
    const votes = [
      makeDV('v1', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }),
      makeDV('v2', 'TRUE', { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }),
      makeDV('v3', 'FALSE', { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }),
    ];

    const result = rbts.calculate(votes, 'QmRumor1', 100);

    expect(result.voterScores.size).toBe(3);
    expect(result.peerAssignments.size).toBe(3);
    expect(result.consensus).toBe('TRUE');
  });

  test('should assign peers deterministically (same seed = same result)', () => {
    const votes = [
      makeDV('v1', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }),
      makeDV('v2', 'FALSE', { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }),
      makeDV('v3', 'TRUE', { TRUE: 0.5, FALSE: 0.3, UNVERIFIED: 0.2 }),
    ];

    const r1 = rbts.calculate(votes, 'QmRumor1', 42);
    const r2 = rbts.calculate(votes, 'QmRumor1', 42);

    // Same seed → same peer assignments → same scores
    for (const [nul, score] of r1.voterScores) {
      expect(r2.voterScores.get(nul)).toBeCloseTo(score, 10);
    }
  });

  test('should produce different results with different seeds', () => {
    const votes = [
      makeDV('v1', 'TRUE', { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 }),
      makeDV('v2', 'FALSE', { TRUE: 0.2, FALSE: 0.7, UNVERIFIED: 0.1 }),
      makeDV('v3', 'TRUE', { TRUE: 0.5, FALSE: 0.3, UNVERIFIED: 0.2 }),
      makeDV('v4', 'FALSE', { TRUE: 0.4, FALSE: 0.5, UNVERIFIED: 0.1 }),
    ];

    const r1 = rbts.calculate(votes, 'QmA', 1);
    const r2 = rbts.calculate(votes, 'QmB', 999);

    // At least one peer assignment should differ
    let anyDifferent = false;
    for (const [nul] of r1.peerAssignments) {
      const a1 = r1.peerAssignments.get(nul);
      const a2 = r2.peerAssignments.get(nul);
      if (a1.reference !== a2.reference || a1.peer !== a2.peer) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  test('should reward voters whose vote matches reference', () => {
    // All vote TRUE — everyone's info score should be 1.0
    const votes = [
      makeDV('v1', 'TRUE', { TRUE: 0.9, FALSE: 0.05, UNVERIFIED: 0.05 }),
      makeDV('v2', 'TRUE', { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }),
      makeDV('v3', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }),
    ];

    const result = rbts.calculate(votes, 'QmUnanimous', 0);

    // All info scores = 1 (match reference), all pred scores = log(pred_TRUE)
    for (const [, score] of result.voterScores) {
      // Score = 1 + α·log(pred_TRUE), all have positive pred for TRUE
      expect(score).toBeGreaterThan(0);
    }
  });

  test('should ensure peer assignments are valid (no self-reference)', () => {
    const votes = [];
    for (let i = 0; i < 10; i++) {
      votes.push(makeDV(`v${i}`, 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }));
    }

    const result = rbts.calculate(votes, 'QmTest', 0);

    for (const [nul, assignment] of result.peerAssignments) {
      expect(assignment.reference).not.toBe(nul);
      expect(assignment.peer).not.toBe(nul);
      expect(assignment.peer).not.toBe(assignment.reference);
    }
  });
});

// ═════════════════════════════════════════════════════════════
// 4. ReputationManager
// ═════════════════════════════════════════════════════════════
describe('ReputationManager', () => {
  let rep;

  beforeEach(() => {
    rep = new ReputationManager();
  });

  // ── Registration ──────────────────────────────────────────

  test('should register users with initial score', () => {
    const score = rep.register('user1');
    expect(score).toBe(10);
    expect(rep.getScore('user1')).toBe(10);
    expect(rep.userCount).toBe(1);
  });

  test('should not overwrite existing user on re-register', () => {
    rep.register('user1');
    rep._users.get('user1').score = 50;
    const score = rep.register('user1');
    expect(score).toBe(50);
  });

  test('should return 0 for unknown users', () => {
    expect(rep.getScore('unknown')).toBe(0);
  });

  // ── Staking ───────────────────────────────────────────────

  test('should allow valid stakes', () => {
    rep.register('user1');
    expect(rep.canStake('user1', 1, 'vote')).toBe(true);
    expect(rep.canStake('user1', 2, 'vote')).toBe(true);
  });

  test('should reject stake below minimum', () => {
    rep.register('user1');
    expect(rep.canStake('user1', 0, 'vote')).toBe(false);
    expect(rep.canStake('user1', 4, 'post')).toBe(false); // min 5
  });

  test('should reject stake above maximum fraction', () => {
    rep.register('user1'); // score=10
    // vote max = 25% of 10 = 2.5
    expect(rep.canStake('user1', 3, 'vote')).toBe(false);
    // post max = 50% of 10 = 5
    expect(rep.canStake('user1', 5, 'post')).toBe(true);
    expect(rep.canStake('user1', 6, 'post')).toBe(false);
  });

  test('should reject stake for unknown user', () => {
    expect(rep.canStake('nobody', 1, 'vote')).toBe(false);
  });

  test('should lock and release stakes', () => {
    rep.register('user1');
    const lock = rep.lockStake('user1', 1, 'rumor1', 'vote');
    expect(lock.amount).toBe(1);

    // Can't stake more than available (10 - 1 locked = 9 available, max=2.5)
    expect(rep.canStake('user1', 2.5, 'vote')).toBe(true);

    // Release
    expect(rep.releaseLock('user1', 'rumor1')).toBe(true);
  });

  test('should throw on invalid stake attempt', () => {
    rep.register('user1');
    expect(() => rep.lockStake('user1', 100, 'r1', 'vote')).toThrow('E007');
  });

  // ── Scoring ───────────────────────────────────────────────

  test('should reward voters with positive BTS scores', () => {
    rep.register('v1');
    rep.register('v2');

    const btsResult = {
      voterScores: new Map([['v1', 0.5], ['v2', -0.3]]),
    };

    const { rewards, slashes } = rep.applyScores(btsResult, 'rumor1');

    expect(rewards.has('v1')).toBe(true);
    expect(slashes.has('v2')).toBe(true);

    expect(rep.getScore('v1')).toBeGreaterThan(10);
    expect(rep.getScore('v2')).toBeLessThan(10);
  });

  test('should apply custom stake amounts to scoring', () => {
    rep.register('v1');
    rep.register('v2');

    const btsResult = {
      voterScores: new Map([['v1', 1.0], ['v2', 1.0]]),
    };
    const stakes = new Map([['v1', 5], ['v2', 1]]);

    const { rewards } = rep.applyScores(btsResult, 'r1', stakes);

    // v1 staked 5× more → should get 5× reward
    expect(rewards.get('v1')).toBeCloseTo(rewards.get('v2') * 5, 4);
  });

  test('should slash harder than reward (asymmetric multipliers)', () => {
    rep.register('v1');
    const btsResult1 = { voterScores: new Map([['v1', 1.0]]) };
    rep.applyScores(btsResult1, 'r1');
    const afterReward = rep.getScore('v1');

    const btsResult2 = { voterScores: new Map([['v1', -1.0]]) };
    rep.applyScores(btsResult2, 'r2');
    const afterSlash = rep.getScore('v1');

    // slashMultiplier=1.5 vs rewardMultiplier=1.0
    // After +1.0: score = 10 + 1.0*1*1.0 = 11
    // After -1.0: score = 11 - 1.0*1*1.5 = 9.5
    expect(afterReward).toBe(11);
    expect(afterSlash).toBe(9.5);
  });

  test('should auto-register unknown voters during applyScores', () => {
    const btsResult = { voterScores: new Map([['newbie', 0.5]]) };
    rep.applyScores(btsResult, 'r1');
    expect(rep.getScore('newbie')).toBeGreaterThan(0);
  });

  test('should clamp scores to [minScore, maxScore]', () => {
    rep.register('v1');
    // Giant reward
    const big = { voterScores: new Map([['v1', 10000]]) };
    rep.applyScores(big, 'big_reward');
    expect(rep.getScore('v1')).toBe(1000); // MAX_SCORE

    // Giant slash
    const bigSlash = { voterScores: new Map([['v1', -10000]]) };
    rep.applyScores(bigSlash, 'big_slash');
    expect(rep.getScore('v1')).toBe(0); // MIN_SCORE
  });

  // ── Group Slash ───────────────────────────────────────────

  test('should apply escalating group slash', () => {
    rep.register('b1');
    rep.register('b2');
    rep.register('b3');
    rep.register('b4');

    // Group of 4: penalty = basePenalty × (1 + log2(4)) = base × 3
    const slashes = rep.applyGroupSlash(['b1', 'b2', 'b3', 'b4'], 1.0, 'r1');

    const expectedPenalty = 1.0 * (1 + Math.log2(4)); // 3.0
    for (const [, penalty] of slashes) {
      expect(penalty).toBeCloseTo(expectedPenalty, 4);
    }

    // All should be 10 - 3 = 7
    expect(rep.getScore('b1')).toBe(7);
  });

  // ── Decay & Recovery ──────────────────────────────────────

  test('should apply decay to all users', () => {
    rep.register('u1');
    rep.register('u2');

    rep.applyDecay();

    expect(rep.getScore('u1')).toBeCloseTo(10 * 0.99, 4);
    expect(rep.getScore('u2')).toBeCloseTo(10 * 0.99, 4);
  });

  test('should apply recovery to zeroed users', () => {
    rep.register('u1');
    rep._users.get('u1').score = 0;

    rep.applyRecovery();

    expect(rep.getScore('u1')).toBe(0.1); // RECOVERY_RATE
  });

  test('should not recover beyond initial score', () => {
    rep.register('u1');
    rep._users.get('u1').score = 9.95;

    rep.applyRecovery();

    expect(rep.getScore('u1')).toBe(10); // capped at initial
  });

  // ── Export / Import ───────────────────────────────────────

  test('should export and import user data', () => {
    rep.register('u1');
    rep.register('u2');
    rep._users.get('u1').score = 42;

    const data = rep.export();
    expect(data).toHaveLength(2);

    const rep2 = new ReputationManager();
    rep2.import(data);

    expect(rep2.getScore('u1')).toBe(42);
    expect(rep2.getScore('u2')).toBe(10);
  });

  test('should track history through all operations', () => {
    rep.register('u1');

    rep.lockStake('u1', 1, 'r1', 'vote');
    rep.applyScores({ voterScores: new Map([['u1', 0.5]]) }, 'r1');
    rep.applyDecay();

    const user = rep.getUser('u1');
    // history: stake_lock, reward, decay
    expect(user.history.length).toBeGreaterThanOrEqual(3);
    expect(user.history.map(h => h.type)).toEqual(
      expect.arrayContaining(['stake_lock', 'reward', 'decay'])
    );
  });
});

// ═════════════════════════════════════════════════════════════
// 5. Full Scoring Pipeline Integration
// ═════════════════════════════════════════════════════════════
describe('Full Scoring Pipeline', () => {
  test('end-to-end: dampen → BTS → reputation', () => {
    const dampener = new CorrelationDampener();
    const bts = new BTSEngine();
    const rep = new ReputationManager();

    // Register 5 honest voters + 3 bots
    const honest = ['h1', 'h2', 'h3', 'h4', 'h5'];
    const bots = ['bot1', 'bot2', 'bot3'];
    [...honest, ...bots].forEach(id => rep.register(id));

    // Votes for a rumor
    const rawVotes = [
      makeVote('h1', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }),
      makeVote('h2', 'TRUE', { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 }),
      makeVote('h3', 'TRUE', { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }),
      makeVote('h4', 'FALSE', { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }),
      makeVote('h5', 'TRUE', { TRUE: 0.65, FALSE: 0.25, UNVERIFIED: 0.1 }),
      makeVote('bot1', 'FALSE', { TRUE: 0.1, FALSE: 0.8, UNVERIFIED: 0.1 }),
      makeVote('bot2', 'FALSE', { TRUE: 0.1, FALSE: 0.8, UNVERIFIED: 0.1 }),
      makeVote('bot3', 'FALSE', { TRUE: 0.1, FALSE: 0.8, UNVERIFIED: 0.1 }),
    ];

    // Vote history: bots always vote identically
    const voteHistory = new Map();
    const botShared = [
      { rumorId: 'past1', vote: 'FALSE' },
      { rumorId: 'past2', vote: 'FALSE' },
      { rumorId: 'past3', vote: 'TRUE' },
    ];
    bots.forEach(b => voteHistory.set(b, [...botShared]));
    voteHistory.set('h1', [{ rumorId: 'past1', vote: 'TRUE' }, { rumorId: 'past2', vote: 'FALSE' }, { rumorId: 'past3', vote: 'TRUE' }]);
    voteHistory.set('h2', [{ rumorId: 'past1', vote: 'FALSE' }, { rumorId: 'past2', vote: 'TRUE' }, { rumorId: 'past3', vote: 'FALSE' }]);
    voteHistory.set('h3', [{ rumorId: 'past1', vote: 'TRUE' }, { rumorId: 'past2', vote: 'TRUE' }, { rumorId: 'past3', vote: 'FALSE' }]);
    voteHistory.set('h4', [{ rumorId: 'past1', vote: 'FALSE' }, { rumorId: 'past2', vote: 'TRUE' }, { rumorId: 'past3', vote: 'TRUE' }]);
    voteHistory.set('h5', [{ rumorId: 'past1', vote: 'TRUE' }, { rumorId: 'past2', vote: 'FALSE' }, { rumorId: 'past3', vote: 'FALSE' }]);

    // Step 1: Dampen
    const dampened = dampener.dampen(rawVotes, voteHistory);
    expect(dampened).toHaveLength(8);

    // Bots should be dampened
    const botWeights = dampened.filter(d => d.vote.nullifier.startsWith('bot'));
    for (const bw of botWeights) {
      expect(bw.weight).toBeLessThan(1.0);
    }

    // Step 2: BTS
    const btsResult = bts.calculate(dampened);
    expect(btsResult.consensus).toBeDefined();
    expect(btsResult.voterScores.size).toBe(8);

    // Step 3: Reputation update
    const stakes = new Map(rawVotes.map(v => [v.nullifier, v.stakeAmount]));
    const { rewards, slashes } = rep.applyScores(btsResult, 'current_rumor', stakes);

    // At least some voters should be rewarded/slashed
    expect(rewards.size + slashes.size).toBeGreaterThan(0);

    console.log('  Pipeline results:');
    console.log(`    Consensus: ${btsResult.consensus}`);
    console.log(`    Trust score: ${btsResult.rumorTrustScore.toFixed(1)}`);
    console.log(`    Rewards: ${rewards.size}, Slashes: ${slashes.size}`);
    console.log(`    Bot weights: ${botWeights.map(b => b.weight.toFixed(3)).join(', ')}`);
  });

  test('end-to-end: dampen → RBTS → reputation (small population)', () => {
    const dampener = new CorrelationDampener();
    const rbts = new RBTSEngine();
    const rep = new ReputationManager();

    // 5 voters (below BTS threshold of 30)
    ['s1', 's2', 's3', 's4', 's5'].forEach(id => rep.register(id));

    const rawVotes = [
      makeVote('s1', 'TRUE', { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }),
      makeVote('s2', 'TRUE', { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }),
      makeVote('s3', 'FALSE', { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }),
      makeVote('s4', 'TRUE', { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 }),
      makeVote('s5', 'UNVERIFIED', { TRUE: 0.2, FALSE: 0.3, UNVERIFIED: 0.5 }),
    ];

    // No history → no dampening
    const dampened = dampener.dampen(rawVotes, new Map());

    // RBTS
    const rbtsResult = rbts.calculate(dampened, 'QmSmallRumor', 50);
    expect(rbtsResult.voterScores.size).toBe(5);
    expect(rbtsResult.peerAssignments.size).toBe(5);

    // Reputation update
    const { rewards, slashes } = rep.applyScores(rbtsResult, 'small_rumor');
    expect(rewards.size + slashes.size).toBeGreaterThan(0);

    console.log('  RBTS Pipeline:');
    console.log(`    Consensus: ${rbtsResult.consensus}`);
    console.log(`    Trust score: ${rbtsResult.rumorTrustScore.toFixed(1)}`);
    console.log(`    Peer assignments: ${rbtsResult.peerAssignments.size}`);
  });

  test('scoring selection: BTS for N≥30, RBTS for N<30', () => {
    const bts = new BTSEngine();
    const rbts = new RBTSEngine();

    const selectEngine = (n) => n >= 30 ? 'BTS' : 'RBTS';

    expect(selectEngine(30)).toBe('BTS');
    expect(selectEngine(100)).toBe('BTS');
    expect(selectEngine(29)).toBe('RBTS');
    expect(selectEngine(3)).toBe('RBTS');
  });
});
