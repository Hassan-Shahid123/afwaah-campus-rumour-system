// ─────────────────────────────────────────────────────────────
// Afwaah — Robust Bayesian Truth Serum (RBTS) Engine
// For small populations (3 ≤ N < 30) where standard BTS
// geometric means are unstable.
//
// Uses peer-pairing instead of population statistics:
//   InfoScore_i  = 1[x_i == x_{r(i)}]   (match with reference)
//   PredScore_i  = log(P_{x_{p(i)}}^i)  (prob assigned to peer's answer)
//   Score_i      = InfoScore_i + α · PredScore_i
// ─────────────────────────────────────────────────────────────

import { SCORING } from '../config.js';

/**
 * RBTSEngine computes Robust BTS scores using peer-pairing,
 * suitable for small voter populations (N ≥ 3).
 */
export class RBTSEngine {
  /**
   * @param {number} [alpha=1.0] — weight of prediction component
   * @param {number} [floor=0.001] — prediction floor to avoid log(0)
   */
  constructor(
    alpha = SCORING.BTS_ALPHA,
    floor = SCORING.PREDICTION_FLOOR,
  ) {
    this.alpha = alpha;
    this.floor = floor;
  }

  /**
   * Calculate RBTS scores for all voters on a single rumor.
   *
   * @param {Array<{vote: {nullifier: string, vote: string, prediction: object, stakeAmount?: number}, weight: number}>} dampenedVotes
   * @param {string} rumorId — used to seed the PRNG for peer assignments
   * @param {number} [blockHeight=0] — operation count for deterministic seeding
   * @returns {{
   *   rumorTrustScore: number,
   *   voterScores: Map<string, number>,
   *   actualProportions: object,
   *   peerAssignments: Map<string, {reference: string, peer: string}>,
   *   consensus: string,
   * }}
   */
  calculate(dampenedVotes, rumorId = '', blockHeight = 0) {
    if (!dampenedVotes || dampenedVotes.length < 3) {
      return this._emptyResult();
    }

    // Step 1: Deterministic peer assignment
    const seed = this._computeSeed(rumorId, blockHeight);
    const peerAssignments = this._assignPeers(dampenedVotes, seed);

    // Step 2: Compute actual proportions (for trust score)
    const actualProportions = this._computeActualProportions(dampenedVotes);

    // Step 3: Compute individual scores
    const voterScores = new Map();
    const voteByNullifier = new Map(dampenedVotes.map(dv => [dv.vote.nullifier, dv]));

    for (const dv of dampenedVotes) {
      const { vote } = dv;
      const nullifier = vote.nullifier;
      const assignment = peerAssignments.get(nullifier);

      if (!assignment) {
        voterScores.set(nullifier, 0);
        continue;
      }

      // Reference agent's vote
      const refDv = voteByNullifier.get(assignment.reference);
      // Peer agent's vote
      const peerDv = voteByNullifier.get(assignment.peer);

      if (!refDv || !peerDv) {
        voterScores.set(nullifier, 0);
        continue;
      }

      // InfoScore = 1 if my vote matches reference agent's vote, else 0
      const infoScore = (vote.vote === refDv.vote.vote) ? 1.0 : 0.0;

      // PredScore = log(P_{x_{p(i)}}^i)
      // How much probability did I assign to the answer my peer actually gave?
      const peerAnswer = peerDv.vote.vote;
      const myPredForPeerAnswer = Math.max(
        vote.prediction?.[peerAnswer] ?? this.floor,
        this.floor,
      );
      const predScore = Math.log(myPredForPeerAnswer);

      const totalScore = infoScore + this.alpha * predScore;
      voterScores.set(nullifier, totalScore);
    }

    // Rumor trust score
    const rumorTrustScore = this._computeRumorTrustScore(dampenedVotes);
    const consensus = this._determineConsensus(actualProportions);

    return {
      rumorTrustScore,
      voterScores,
      actualProportions,
      peerAssignments,
      consensus,
    };
  }

  // ── Internal: Peer Assignment ──────────────────────────────

  /**
   * Deterministic PRNG seed from rumorId + blockHeight.
   * Simple hash → number.
   * @private
   */
  _computeSeed(rumorId, blockHeight) {
    const str = `${rumorId}:${blockHeight}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + ch;
      hash |= 0; // convert to 32-bit int
    }
    return Math.abs(hash);
  }

  /**
   * Deterministic pseudo-random number generator (Mulberry32).
   * @private
   */
  _prng(seed) {
    let s = seed;
    return () => {
      s |= 0;
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Assign reference and peer agents to each voter.
   * Ensures r(i) ≠ i, p(i) ≠ i, and p(i) ≠ r(i).
   * @private
   */
  _assignPeers(dampenedVotes, seed) {
    const n = dampenedVotes.length;
    const nullifiers = dampenedVotes.map(dv => dv.vote.nullifier);
    const rand = this._prng(seed);

    const assignments = new Map();

    for (let i = 0; i < n; i++) {
      // Pick reference: any index ≠ i
      let rIdx;
      do {
        rIdx = Math.floor(rand() * n);
      } while (rIdx === i);

      // Pick peer: any index ≠ i and ≠ rIdx
      let pIdx;
      if (n <= 2) {
        pIdx = rIdx; // can't avoid overlap with only 2 others
      } else {
        do {
          pIdx = Math.floor(rand() * n);
        } while (pIdx === i || pIdx === rIdx);
      }

      assignments.set(nullifiers[i], {
        reference: nullifiers[rIdx],
        peer: nullifiers[pIdx],
      });
    }

    return assignments;
  }

  // ── Internal: Shared Helpers ───────────────────────────────

  /** @private */
  _computeActualProportions(dampenedVotes) {
    const counts = { TRUE: 0, FALSE: 0, UNVERIFIED: 0 };
    let totalWeight = 0;

    for (const dv of dampenedVotes) {
      const k = dv.vote.vote;
      if (counts.hasOwnProperty(k)) counts[k] += dv.weight;
      totalWeight += dv.weight;
    }

    if (totalWeight === 0) return { TRUE: 0, FALSE: 0, UNVERIFIED: 0 };
    return {
      TRUE: counts.TRUE / totalWeight,
      FALSE: counts.FALSE / totalWeight,
      UNVERIFIED: counts.UNVERIFIED / totalWeight,
    };
  }

  /** @private */
  _computeRumorTrustScore(dampenedVotes) {
    let trueWeight = 0, totalWeight = 0;
    for (const dv of dampenedVotes) {
      const rep = dv.vote.stakeAmount || 1;
      const w = dv.weight * rep;
      totalWeight += w;
      if (dv.vote.vote === 'TRUE') trueWeight += w;
    }
    if (totalWeight === 0) return 50;
    return (trueWeight / totalWeight) * 100;
  }

  /** @private */
  _determineConsensus(proportions) {
    const { TRUE: t, FALSE: f, UNVERIFIED: u } = proportions;
    if (t > 0.5) return 'TRUE';
    if (f > 0.5) return 'FALSE';
    if (u > 0.5) return 'UNVERIFIED';
    return 'DISPUTED';
  }

  /** @private */
  _emptyResult() {
    return {
      rumorTrustScore: 50,
      voterScores: new Map(),
      actualProportions: { TRUE: 0, FALSE: 0, UNVERIFIED: 0 },
      peerAssignments: new Map(),
      consensus: 'UNVERIFIED',
    };
  }
}
