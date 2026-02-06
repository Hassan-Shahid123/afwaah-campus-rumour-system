// ─────────────────────────────────────────────────────────────
// Afwaah — Correlation Dampener
// Detects groups of identities voting in lockstep (botnets)
// and reduces their collective weight to that of ~1 user.
//
// Algorithm:
//   1. Build vote-history feature vectors per voter
//   2. Compute pairwise Pearson correlation
//   3. Union-Find to cluster correlated voters (ρ > threshold)
//   4. Apply dampening weight W = 1 / (1 + λ·ρ̄)
// ─────────────────────────────────────────────────────────────

import { SCORING } from '../config.js';

/**
 * CorrelationDampener detects coordinated voting patterns
 * and adjusts vote weights to neutralize bot clusters.
 */
export class CorrelationDampener {
  /**
   * @param {number} [lambda=10.0]  — sensitivity parameter
   * @param {number} [clusterThreshold=0.85] — Pearson ρ above which voters are clustered
   */
  constructor(
    lambda = SCORING.CORRELATION_LAMBDA,
    clusterThreshold = SCORING.CLUSTER_THRESHOLD,
  ) {
    this.lambda = lambda;
    this.clusterThreshold = clusterThreshold;
  }

  /**
   * Dampen votes based on cross-rumor voting correlation.
   *
   * @param {Array<{nullifier: string, vote: string, prediction: object, stakeAmount?: number}>} votes
   *   — votes for a single rumor
   * @param {Map<string, Array<{rumorId: string, vote: string}>>} voteHistory
   *   — historical votes per nullifier (across all rumors)
   * @returns {Array<{vote: object, weight: number, clusterId: string, clusterSize: number}>}
   */
  dampen(votes, voteHistory = new Map()) {
    if (!votes || votes.length === 0) return [];

    const nullifiers = votes.map(v => v.nullifier);

    // If no history or only 1 voter → no dampening possible
    if (voteHistory.size < 2 || nullifiers.length < 2) {
      return votes.map(v => ({
        vote: v,
        weight: 1.0,
        clusterId: v.nullifier,
        clusterSize: 1,
      }));
    }

    // Step 1: Build feature vectors from vote history
    const vectors = this._buildVoteVectors(nullifiers, voteHistory);

    // Step 2: Compute pairwise correlations
    const correlations = this._computePairwiseCorrelations(nullifiers, vectors);

    // Step 3: Cluster via Union-Find
    const clusters = this._clusterVoters(nullifiers, correlations);

    // Step 4: Compute dampening weights per cluster
    const clusterWeights = this._computeClusterWeights(clusters, correlations);

    // Build result
    return votes.map(v => {
      const cid = clusters.get(v.nullifier) || v.nullifier;
      const info = clusterWeights.get(cid) || { weight: 1.0, size: 1 };
      return {
        vote: v,
        weight: info.weight,
        clusterId: cid,
        clusterSize: info.size,
      };
    });
  }

  // ── Internal: Feature Vectors ──────────────────────────────

  /**
   * Build numerical vote vectors for each voter across shared rumors.
   * @private
   */
  _buildVoteVectors(nullifiers, voteHistory) {
    // Collect all rumor IDs voted on by these voters
    const allRumorIds = new Set();
    for (const nul of nullifiers) {
      const history = voteHistory.get(nul);
      if (history) {
        for (const h of history) allRumorIds.add(h.rumorId);
      }
    }

    const rumorList = [...allRumorIds];
    const vectors = new Map();

    for (const nul of nullifiers) {
      const history = voteHistory.get(nul) || [];
      const voteMap = new Map(history.map(h => [h.rumorId, h.vote]));
      const vector = rumorList.map(rid => {
        const v = voteMap.get(rid);
        if (v === 'TRUE') return 1;
        if (v === 'FALSE') return -1;
        if (v === 'UNVERIFIED') return 0;
        return NaN; // did not vote on this rumor
      });
      vectors.set(nul, vector);
    }

    return vectors;
  }

  // ── Internal: Pearson Correlation ──────────────────────────

  /**
   * Compute pairwise Pearson correlation between all voter pairs.
   * Only considers dimensions where both voters participated.
   * @private
   */
  _computePairwiseCorrelations(nullifiers, vectors) {
    const corr = new Map(); // "nulA|nulB" → ρ

    for (let i = 0; i < nullifiers.length; i++) {
      for (let j = i + 1; j < nullifiers.length; j++) {
        const a = nullifiers[i];
        const b = nullifiers[j];
        const va = vectors.get(a);
        const vb = vectors.get(b);
        const rho = this._pearson(va, vb);
        if (!isNaN(rho)) {
          const key = `${a}|${b}`;
          corr.set(key, rho);
        }
      }
    }

    return corr;
  }

  /**
   * Pearson correlation coefficient between two vectors.
   * Skips indices where either is NaN (voter didn't vote).
   * @private
   */
  _pearson(va, vb) {
    // Get shared indices
    const shared = [];
    for (let k = 0; k < va.length; k++) {
      if (!isNaN(va[k]) && !isNaN(vb[k])) {
        shared.push(k);
      }
    }

    if (shared.length < 2) return NaN; // need ≥2 shared votes

    const n = shared.length;
    let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;

    for (const k of shared) {
      sumA += va[k];
      sumB += vb[k];
      sumA2 += va[k] * va[k];
      sumB2 += vb[k] * vb[k];
      sumAB += va[k] * vb[k];
    }

    const num = n * sumAB - sumA * sumB;
    const denA = Math.sqrt(n * sumA2 - sumA * sumA);
    const denB = Math.sqrt(n * sumB2 - sumB * sumB);

    if (denA === 0 || denB === 0) return 1.0; // identical votes → perfect correlation
    return num / (denA * denB);
  }

  // ── Internal: Union-Find Clustering ────────────────────────

  /**
   * Group voters whose cross-rumor correlation exceeds threshold.
   * @returns {Map<string, string>} nullifier → cluster representative
   * @private
   */
  _clusterVoters(nullifiers, correlations) {
    // Union-Find
    const parent = new Map();
    const rank = new Map();

    for (const n of nullifiers) {
      parent.set(n, n);
      rank.set(n, 0);
    }

    const find = (x) => {
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
      return parent.get(x);
    };

    const union = (x, y) => {
      const rx = find(x), ry = find(y);
      if (rx === ry) return;
      if (rank.get(rx) < rank.get(ry)) parent.set(rx, ry);
      else if (rank.get(rx) > rank.get(ry)) parent.set(ry, rx);
      else { parent.set(ry, rx); rank.set(rx, rank.get(rx) + 1); }
    };

    for (const [key, rho] of correlations) {
      if (rho > this.clusterThreshold) {
        const [a, b] = key.split('|');
        union(a, b);
      }
    }

    // Resolve all parents
    const result = new Map();
    for (const n of nullifiers) {
      result.set(n, find(n));
    }
    return result;
  }

  // ── Internal: Cluster Weights ──────────────────────────────

  /**
   * Compute dampening weight for each cluster.
   * W = 1 / (1 + λ · ρ̄)
   * @private
   */
  _computeClusterWeights(clusters, correlations) {
    // Group members by cluster
    const members = new Map(); // clusterId → [nullifiers]
    for (const [nul, cid] of clusters) {
      if (!members.has(cid)) members.set(cid, []);
      members.get(cid).push(nul);
    }

    const weights = new Map();

    for (const [cid, mems] of members) {
      if (mems.length <= 1) {
        weights.set(cid, { weight: 1.0, size: 1 });
        continue;
      }

      // Average intra-cluster correlation
      let sumRho = 0, count = 0;
      for (let i = 0; i < mems.length; i++) {
        for (let j = i + 1; j < mems.length; j++) {
          const key1 = `${mems[i]}|${mems[j]}`;
          const key2 = `${mems[j]}|${mems[i]}`;
          const rho = correlations.get(key1) ?? correlations.get(key2) ?? 0;
          sumRho += rho;
          count++;
        }
      }

      const avgRho = count > 0 ? sumRho / count : 0;
      const weight = 1.0 / (1.0 + this.lambda * avgRho);

      weights.set(cid, { weight, size: mems.length });
    }

    return weights;
  }
}
