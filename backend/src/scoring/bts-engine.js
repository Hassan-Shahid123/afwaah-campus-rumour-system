// ─────────────────────────────────────────────────────────────
// Afwaah — Bayesian Truth Serum (BTS) Engine
// Implements the BTS scoring formula for large populations (N≥30).
//
// Score_i = InfoScore_i + α · PredScore_i
//   InfoScore_i = log(x̄_k / ȳ_k)
//   PredScore_i = α · Σⱼ x̄_j · log(P_j^i / x̄_j)
//
// Where:
//   x̄_k = weighted actual proportion of answer k
//   ȳ_k = weighted geometric mean of predictions for answer k
//   P_j^i = voter i's prediction for answer j
//   α = prediction weight parameter
// ─────────────────────────────────────────────────────────────

import { SCORING, PROTOCOL } from '../config.js';

const VOTE_KEYS = PROTOCOL.VOTE_VALUES; // ['TRUE', 'FALSE', 'UNVERIFIED']

/**
 * BTSEngine computes Bayesian Truth Serum scores for
 * rumor verification with large voter populations.
 */
export class BTSEngine {
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
   * Calculate BTS scores for all voters on a single rumor.
   *
   * @param {Array<{vote: {nullifier: string, vote: string, prediction: object, stakeAmount?: number}, weight: number}>} dampenedVotes
   *   — output from CorrelationDampener.dampen()
   * @returns {{
   *   rumorTrustScore: number,
   *   voterScores: Map<string, number>,
   *   actualProportions: object,
   *   geometricMeans: object,
   *   consensus: string,
   * }}
   */
  calculate(dampenedVotes) {
    if (!dampenedVotes || dampenedVotes.length === 0) {
      return this._emptyResult();
    }

    // Step 1: Compute weighted actual proportions x̄_k
    const actualProportions = this._computeActualProportions(dampenedVotes);

    // Step 2: Compute weighted geometric mean of predictions ȳ_k
    const geometricMeans = this._computeGeometricMeans(dampenedVotes);

    // Step 3 & 4: Compute individual voter scores
    const voterScores = new Map();

    for (const dv of dampenedVotes) {
      const { vote, weight } = dv;
      const nullifier = vote.nullifier;
      const chosenK = vote.vote; // 'TRUE', 'FALSE', or 'UNVERIFIED'

      // InfoScore = log(x̄_k / ȳ_k)
      const xk = Math.max(actualProportions[chosenK], this.floor);
      const yk = Math.max(geometricMeans[chosenK], this.floor);
      const infoScore = Math.log(xk / yk);

      // PredScore = α · Σ_j x̄_j · log(P_j^i / x̄_j)
      let predScore = 0;
      for (const k of VOTE_KEYS) {
        const xj = Math.max(actualProportions[k], this.floor);
        const pji = Math.max(vote.prediction?.[k] ?? this.floor, this.floor);
        predScore += xj * Math.log(pji / xj);
      }
      predScore *= this.alpha;

      const totalScore = infoScore + predScore;
      voterScores.set(nullifier, totalScore);
    }

    // Step 5: Compute rumor trust score
    const rumorTrustScore = this._computeRumorTrustScore(dampenedVotes);

    // Determine consensus
    const consensus = this._determineConsensus(actualProportions);

    return {
      rumorTrustScore,
      voterScores,
      actualProportions,
      geometricMeans,
      consensus,
    };
  }

  // ── Internal ───────────────────────────────────────────────

  /**
   * Weighted actual proportions: x̄_k = Σ(w_i · 1[x_i=k]) / Σ(w_i)
   * @private
   */
  _computeActualProportions(dampenedVotes) {
    const counts = { TRUE: 0, FALSE: 0, UNVERIFIED: 0 };
    let totalWeight = 0;

    for (const dv of dampenedVotes) {
      const k = dv.vote.vote;
      if (counts.hasOwnProperty(k)) {
        counts[k] += dv.weight;
      }
      totalWeight += dv.weight;
    }

    if (totalWeight === 0) return { TRUE: 0, FALSE: 0, UNVERIFIED: 0 };

    return {
      TRUE: counts.TRUE / totalWeight,
      FALSE: counts.FALSE / totalWeight,
      UNVERIFIED: counts.UNVERIFIED / totalWeight,
    };
  }

  /**
   * Weighted geometric mean of predictions:
   * log(ȳ_k) = Σ(w_i · log(P_k^i)) / Σ(w_i)
   * @private
   */
  _computeGeometricMeans(dampenedVotes) {
    const logSums = { TRUE: 0, FALSE: 0, UNVERIFIED: 0 };
    let totalWeight = 0;

    for (const dv of dampenedVotes) {
      const pred = dv.vote.prediction || {};
      for (const k of VOTE_KEYS) {
        const pk = Math.max(pred[k] ?? this.floor, this.floor);
        logSums[k] += dv.weight * Math.log(pk);
      }
      totalWeight += dv.weight;
    }

    if (totalWeight === 0) {
      return { TRUE: this.floor, FALSE: this.floor, UNVERIFIED: this.floor };
    }

    return {
      TRUE: Math.exp(logSums.TRUE / totalWeight),
      FALSE: Math.exp(logSums.FALSE / totalWeight),
      UNVERIFIED: Math.exp(logSums.UNVERIFIED / totalWeight),
    };
  }

  /**
   * Rumor trust score: weighted proportion of TRUE voters
   * scaled by their reputation weight.
   * TrustScore = Σ(w_i · rep_i for TRUE voters) / Σ(w_i · rep_i) × 100
   * @private
   */
  _computeRumorTrustScore(dampenedVotes) {
    let trueWeight = 0;
    let totalWeight = 0;

    for (const dv of dampenedVotes) {
      const rep = dv.vote.stakeAmount || 1;
      const w = dv.weight * rep;
      totalWeight += w;
      if (dv.vote.vote === 'TRUE') trueWeight += w;
    }

    if (totalWeight === 0) return 50; // neutral
    return (trueWeight / totalWeight) * 100;
  }

  /**
   * Determine consensus label from actual proportions.
   * @private
   */
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
      geometricMeans: { TRUE: 0, FALSE: 0, UNVERIFIED: 0 },
      consensus: 'UNVERIFIED',
    };
  }
}
