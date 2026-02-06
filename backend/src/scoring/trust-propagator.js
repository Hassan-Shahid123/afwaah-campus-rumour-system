// ─────────────────────────────────────────────────────────────
// Afwaah — Trust Propagator (Personalized PageRank)
// Computes subjective trust rankings using PPR so each device
// can independently weight truth via its own trust seeds.
//
// Algorithm:
//   PPR(u) = (1−d)·p(u) + d·Σ_{v→u} PPR(v) / L(v)
//
// Where:
//   d = damping factor (0.85)
//   p = personalization vector (restart distribution)
//   L(v) = out-degree of node v
//
// The trust graph is built from co-correct voting:
//   If voter A and voter B both correctly voted on Rumor R,
//   an edge is added between them weighted by their BTS scores.
// ─────────────────────────────────────────────────────────────

/**
 * TrustPropagator computes Personalized PageRank over a
 * trust graph derived from voting interactions.
 */
export class TrustPropagator {
  /**
   * @param {number} [dampingFactor=0.85] — probability of following an edge
   * @param {number} [maxIterations=100] — max PPR iterations
   * @param {number} [tolerance=1e-6] — convergence threshold
   */
  constructor(dampingFactor = 0.85, maxIterations = 100, tolerance = 1e-6) {
    this.dampingFactor = dampingFactor;
    this.maxIterations = maxIterations;
    this.tolerance = tolerance;
  }

  // ── Trust Graph Construction ───────────────────────────────

  /**
   * Build a trust graph from vote history and BTS score results.
   *
   * Edges connect voters who co-voted correctly on the same rumor.
   * Edge weight = sum of |BTS score| for co-correct votes.
   *
   * @param {Map<string, Array<{nullifier: string, vote: string}>>} voteHistory
   *   — rumorId → array of votes
   * @param {Map<string, {voterScores: Map<string, number>, consensus: string}>} scoreHistory
   *   — rumorId → BTS/RBTS result
   * @returns {TrustGraph} — { nodes: Set, edges: Map<string, Map<string, number>>, outDegree: Map }
   */
  buildGraph(voteHistory, scoreHistory) {
    const nodes = new Set();
    const edges = new Map(); // source → Map(target → weight)

    for (const [rumorId, votes] of voteHistory) {
      const scoreResult = scoreHistory.get(rumorId);
      if (!scoreResult || !scoreResult.consensus) continue;

      const consensus = scoreResult.consensus;
      if (consensus === 'DISPUTED' || consensus === 'UNVERIFIED') continue;

      // Find voters who voted with the consensus
      const correctVoters = [];
      for (const v of votes) {
        if (v.vote === consensus) {
          const voterScore = scoreResult.voterScores?.get(v.nullifier) ?? 0;
          correctVoters.push({
            nullifier: v.nullifier,
            score: Math.abs(voterScore),
          });
        }
      }

      // Create edges between all pairs of correct voters
      for (let i = 0; i < correctVoters.length; i++) {
        for (let j = i + 1; j < correctVoters.length; j++) {
          const a = correctVoters[i];
          const b = correctVoters[j];
          const weight = (a.score + b.score) / 2;

          nodes.add(a.nullifier);
          nodes.add(b.nullifier);

          // Bidirectional edges
          this._addEdge(edges, a.nullifier, b.nullifier, weight);
          this._addEdge(edges, b.nullifier, a.nullifier, weight);
        }
      }
    }

    // Also add isolated nodes (voters who never co-voted correctly)
    for (const [, votes] of voteHistory) {
      for (const v of votes) {
        nodes.add(v.nullifier);
      }
    }

    // Compute out-degree (sum of outgoing edge weights)
    const outDegree = new Map();
    for (const [source, targets] of edges) {
      let total = 0;
      for (const w of targets.values()) total += w;
      outDegree.set(source, total);
    }

    return { nodes, edges, outDegree };
  }

  // ── Personalized PageRank ──────────────────────────────────

  /**
   * Compute Personalized PageRank scores.
   *
   * @param {{nodes: Set, edges: Map, outDegree: Map}} graph — from buildGraph()
   * @param {Map<string, number>} [trustSeeds] — personalization vector (nullifier → weight)
   *   If not provided, uses uniform distribution.
   * @returns {{scores: Map<string, number>, iterations: number, converged: boolean}}
   */
  computePPR(graph, trustSeeds = null) {
    const { nodes, edges, outDegree } = graph;
    const n = nodes.size;

    if (n === 0) {
      return { scores: new Map(), iterations: 0, converged: true };
    }

    // Build personalization vector
    const personalization = this._buildPersonalization(nodes, trustSeeds);

    // Initialize scores uniformly
    const scores = new Map();
    for (const node of nodes) {
      scores.set(node, 1.0 / n);
    }

    const d = this.dampingFactor;
    let converged = false;
    let iterations = 0;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      iterations++;
      const newScores = new Map();
      let maxDiff = 0;

      for (const node of nodes) {
        // Teleport component: (1 - d) * p(node)
        let rank = (1 - d) * (personalization.get(node) || 0);

        // Incoming edge contributions: d * Σ PPR(v) / L(v)
        // We need to find all edges pointing TO this node
        for (const [source, targets] of edges) {
          if (targets.has(node)) {
            const edgeWeight = targets.get(node);
            const srcOutDeg = outDegree.get(source) || 1;
            const contribution = (scores.get(source) || 0) * (edgeWeight / srcOutDeg);
            rank += d * contribution;
          }
        }

        newScores.set(node, rank);
        maxDiff = Math.max(maxDiff, Math.abs(rank - (scores.get(node) || 0)));
      }

      // Update scores
      for (const [node, score] of newScores) {
        scores.set(node, score);
      }

      if (maxDiff < this.tolerance) {
        converged = true;
        break;
      }
    }

    return { scores, iterations, converged };
  }

  // ── Rumor Trust Scoring ────────────────────────────────────

  /**
   * Compute a PPR-weighted trust score for a specific rumor.
   *
   * @param {string} rumorId
   * @param {Map<string, number>} pprScores — from computePPR()
   * @param {Array<{nullifier: string, vote: string}>} votes — votes for this rumor
   * @returns {number} — 0-100 trust score
   */
  getRumorTrust(rumorId, pprScores, votes) {
    if (!votes || votes.length === 0) return 50;

    let trueWeight = 0;
    let totalWeight = 0;

    for (const v of votes) {
      const pprWeight = pprScores.get(v.nullifier) || 0;
      totalWeight += pprWeight;
      if (v.vote === 'TRUE') {
        trueWeight += pprWeight;
      }
    }

    if (totalWeight === 0) return 50;
    return (trueWeight / totalWeight) * 100;
  }

  /**
   * Compute PPR-weighted trust scores for multiple rumors at once.
   *
   * @param {Map<string, number>} pprScores
   * @param {Map<string, Array<{nullifier: string, vote: string}>>} votesByRumor
   * @returns {Map<string, number>} rumorId → trust score (0-100)
   */
  getRumorTrustBatch(pprScores, votesByRumor) {
    const results = new Map();
    for (const [rumorId, votes] of votesByRumor) {
      results.set(rumorId, this.getRumorTrust(rumorId, pprScores, votes));
    }
    return results;
  }

  // ── Graph Analysis ─────────────────────────────────────────

  /**
   * Get the most trusted voters (by PPR score).
   *
   * @param {Map<string, number>} pprScores
   * @param {number} [topN=10]
   * @returns {Array<{nullifier: string, score: number}>}
   */
  getTopTrusted(pprScores, topN = 10) {
    const entries = [...pprScores.entries()]
      .map(([nullifier, score]) => ({ nullifier, score }))
      .sort((a, b) => b.score - a.score);

    return entries.slice(0, topN);
  }

  /**
   * Get graph statistics.
   *
   * @param {{nodes: Set, edges: Map, outDegree: Map}} graph
   * @returns {{nodeCount: number, edgeCount: number, avgDegree: number, density: number}}
   */
  getGraphStats(graph) {
    const nodeCount = graph.nodes.size;
    let edgeCount = 0;
    for (const targets of graph.edges.values()) {
      edgeCount += targets.size;
    }

    const avgDegree = nodeCount > 0 ? edgeCount / nodeCount : 0;
    const maxEdges = nodeCount * (nodeCount - 1);
    const density = maxEdges > 0 ? edgeCount / maxEdges : 0;

    return { nodeCount, edgeCount, avgDegree, density };
  }

  // ── Internal ───────────────────────────────────────────────

  /**
   * Add or increment an edge weight.
   * @private
   */
  _addEdge(edges, source, target, weight) {
    if (!edges.has(source)) edges.set(source, new Map());
    const targets = edges.get(source);
    targets.set(target, (targets.get(target) || 0) + weight);
  }

  /**
   * Build the personalization vector, normalizing to sum = 1.
   * @private
   */
  _buildPersonalization(nodes, trustSeeds) {
    const personalization = new Map();

    if (!trustSeeds || trustSeeds.size === 0) {
      // Uniform distribution
      const uniform = 1.0 / nodes.size;
      for (const node of nodes) {
        personalization.set(node, uniform);
      }
      return personalization;
    }

    // Custom seeds — normalize to sum = 1
    let total = 0;
    for (const node of nodes) {
      const seedWeight = trustSeeds.get(node) ?? 0;
      personalization.set(node, seedWeight);
      total += seedWeight;
    }

    // If all seeds are 0, fall back to uniform
    if (total === 0) {
      const uniform = 1.0 / nodes.size;
      for (const node of nodes) {
        personalization.set(node, uniform);
      }
      return personalization;
    }

    // Normalize
    for (const [node, weight] of personalization) {
      personalization.set(node, weight / total);
    }

    return personalization;
  }
}
