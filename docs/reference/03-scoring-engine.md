# Afwaah — Scoring Engine Specification

> **Version:** 1.0  
> **Scope:** BTS, RBTS, Reputation Staking, Correlation Dampening, Trust Propagation  
> **Purpose:** Mathematical specification for the truth-scoring infrastructure

---

## 1. Overview

The scoring engine is the "brain" of Afwaah. It runs **locally on every device** — there is no central scorer. Every node independently computes the same scores from the same data, achieving consensus without coordination.

The engine has five components:

1. **Correlation Dampener** — Detects and neutralizes bot clusters
2. **BTS Engine** — Bayesian Truth Serum for large populations (N ≥ 30)
3. **RBTS Engine** — Robust BTS for small populations (N < 30)
4. **Reputation Manager** — Staking, slashing, and trust score lifecycle
5. **Trust Propagator** — Personalized PageRank for subjective trust

---

## 2. Correlation Dampener

### 2.1 Purpose

Detect groups of identities that vote in lockstep (botnets) and reduce their collective weight to that of a single user.

### 2.2 Algorithm

**Input:** All votes $V = \{v_1, v_2, ..., v_n\}$ for a rumor, where each $v_i$ contains a vote value and a prediction vector.

**Step 1: Build vote vectors**

For each voter $i$, construct a feature vector across all rumors they've voted on:

$$\vec{f}_i = [vote_{r_1}, vote_{r_2}, ..., vote_{r_k}]$$

where $vote_{r_j} \in \{-1, 0, 1\}$ for `FALSE`, `UNVERIFIED`, `TRUE`.

**Step 2: Compute pairwise correlation**

For each pair of voters $(i, j)$, compute the Pearson correlation coefficient:

$$\rho_{ij} = \frac{\text{cov}(\vec{f}_i, \vec{f}_j)}{\sigma_i \cdot \sigma_j}$$

**Step 3: Identify clusters**

Group voters where $\rho_{ij} > \theta_{cluster}$ (default: $\theta = 0.85$) using a simple union-find algorithm.

**Step 4: Apply dampening weight**

For each cluster $G$ of size $|G|$:

$$W_G = \frac{1}{1 + \lambda \cdot \rho(G)}$$

where:
- $\rho(G)$ = average pairwise correlation within the cluster
- $\lambda$ = sensitivity parameter (default: 10.0)

**Effect:** If 50 accounts vote identically ($\rho = 1.0$):

$$W_{50} = \frac{1}{1 + 10 \times 1.0} = \frac{1}{11} \approx 0.091$$

Their 50 votes become worth approximately 0.091 × 50 = 4.55 effective votes — far less than 50 independent votes.

### 2.3 Implementation Interface

```javascript
class CorrelationDampener {
  constructor(lambda = 10.0, clusterThreshold = 0.85) {}

  /**
   * @param {Vote[]} votes - All votes for a rumor
   * @param {Map<string, Vote[]>} voteHistory - Historical votes per nullifier
   * @returns {DampenedVote[]} - Votes with adjusted weights
   */
  dampen(votes, voteHistory) {}
}

// Output structure
interface DampenedVote {
  vote: Vote;
  weight: number;        // 0.0 to 1.0
  clusterId: string;     // which cluster this voter belongs to
  clusterSize: number;   // how many voters in this cluster
}
```

---

## 3. Bayesian Truth Serum (BTS) Engine

### 3.1 Purpose

Score rumors and voters using a mechanism where **truth-telling is the dominant strategy** (Nash Equilibrium). Used when the voting population N ≥ 30.

### 3.2 Input Data Format

Each vote contains:
- **Information Report** $x_i$: The voter's personal belief: `TRUE` (k=1), `FALSE` (k=2), or `UNVERIFIED` (k=3)
- **Prediction Report** $P^i$: A probability distribution $[P_1^i, P_2^i, P_3^i]$ summing to 1.0

### 3.3 Scoring Formula

**Step 1: Compute actual vote proportions**

$$\bar{x}_k = \frac{\sum_{i=1}^{N} w_i \cdot \mathbb{1}[x_i = k]}{\sum_{i=1}^{N} w_i}$$

where $w_i$ is the dampened weight from the Correlation Dampener and $\mathbb{1}[\cdot]$ is the indicator function.

**Step 2: Compute geometric mean of predictions**

$$\bar{y}_k = \left(\prod_{i=1}^{N} (P_k^i)^{w_i}\right)^{1 / \sum w_i}$$

Equivalently using log:

$$\log \bar{y}_k = \frac{\sum_{i=1}^{N} w_i \cdot \log P_k^i}{\sum_{i=1}^{N} w_i}$$

**Step 3: Information score for voter $i$**

If voter $i$ chose answer $k$:

$$\text{InfoScore}_i = \log \frac{\bar{x}_k}{\bar{y}_k}$$

This rewards voters whose answer is "surprisingly common" — more frequent than predicted.

**Step 4: Prediction score for voter $i$**

$$\text{PredScore}_i = \alpha \sum_{j=1}^{3} \bar{x}_j \cdot \log \frac{P_j^i}{\bar{x}_j}$$

This rewards voters whose predictions are close to the actual distribution (measured by KL divergence).

**Step 5: Total score**

$$S_i = \text{InfoScore}_i + \text{PredScore}_i = \log \frac{\bar{x}_k}{\bar{y}_k} + \alpha \sum_{j=1}^{3} \bar{x}_j \cdot \log \frac{P_j^i}{\bar{x}_j}$$

### 3.4 Rumor Trust Score

The overall trust score for a rumor is derived from the weighted consensus:

$$\text{TrustScore}(R) = \frac{\sum_{i: x_i = \text{TRUE}} w_i \cdot (\text{reputation}_i)}{\sum_{i=1}^{N} w_i \cdot (\text{reputation}_i)} \times 100$$

**Interpretation:**
- 0-30: Likely FALSE (red)
- 30-50: Disputed / UNVERIFIED (yellow)
- 50-70: Leaning TRUE (light green)
- 70-100: Strongly TRUE (green)

### 3.5 Implementation Interface

```javascript
class BTSEngine {
  constructor(alpha = 1.0) {}

  /**
   * @param {DampenedVote[]} dampenedVotes - Weighted votes
   * @returns {BTSResult}
   */
  calculate(dampenedVotes) {}
}

interface BTSResult {
  rumorTrustScore: number;           // 0-100
  voterScores: Map<string, number>;  // nullifier → S_i
  actualProportions: { TRUE: number, FALSE: number, UNVERIFIED: number };
  geometricMeans: { TRUE: number, FALSE: number, UNVERIFIED: number };
  consensus: 'TRUE' | 'FALSE' | 'UNVERIFIED' | 'DISPUTED';
}
```

---

## 4. Robust BTS (RBTS) Engine

### 4.1 Purpose

Provide incentive-compatible truth-telling scoring for small populations (N ≥ 3). Standard BTS requires large N for the law of large numbers to stabilize geometric means. RBTS uses peer-pairing instead.

### 4.2 Algorithm

**Step 1: Random peer assignment**

For each voter $i$, randomly select:
- A **reference agent** $r(i)$: Used to score $i$'s information report
- A **peer agent** $p(i)$: Used to score $i$'s prediction report

Ensure $r(i) \neq i$ and $p(i) \neq i$ and $p(i) \neq r(i)$.

**Step 2: Information score**

$$\text{InfoScore}_i = \mathbb{1}[x_i = x_{r(i)}]$$

Voter $i$ gets a point if their vote matches their reference agent's vote.

**Step 3: Prediction score**

$$\text{PredScore}_i = \log P_{x_{p(i)}}^i$$

Voter $i$ is scored by how much probability they assigned to the answer that peer $p(i)$ actually gave.

**Step 4: Total score**

$$S_i = \text{InfoScore}_i + \alpha \cdot \text{PredScore}_i$$

### 4.3 Deterministic Peer Selection

To ensure all nodes compute the same result, peer assignment uses a deterministic PRNG seeded by:

$$\text{seed} = \text{Poseidon}(\text{rumorId}, \text{blockHeight})$$

where `blockHeight` is the OrbitDB operation count at the time scoring begins.

### 4.4 Implementation Interface

```javascript
class RBTSEngine {
  constructor(alpha = 1.0) {}

  /**
   * @param {DampenedVote[]} dampenedVotes - Weighted votes
   * @param {string} rumorId - For deterministic PRNG seed
   * @param {number} blockHeight - OrbitDB operation count
   * @returns {BTSResult} - Same interface as BTSEngine
   */
  calculate(dampenedVotes, rumorId, blockHeight) {}
}
```

---

## 5. Reputation Manager

### 5.1 Trust Score Lifecycle

```
New User Joins
     │
     ▼
INITIAL_SCORE = 10
     │
     ├── Post rumor (costs MIN_POST_STAKE = 5)
     │      └── If rumor turns FALSE → slashed
     │      └── If rumor turns TRUE  → rewarded
     │
     ├── Vote on rumor (costs MIN_VOTE_STAKE = 1)
     │      └── BTS score > 0 → reputation += score × multiplier
     │      └── BTS score < 0 → reputation -= |score| × multiplier
     │
     ├── Provide Official Proof → bonus reputation
     │
     └── Time decay: score *= DECAY_RATE every epoch
```

### 5.2 Staking Rules

| Action | Minimum Stake | Maximum Stake | Lockup |
|--------|--------------|---------------|--------|
| Post rumor | 5 | 50% of score | Until rumor is scored |
| Vote on rumor | 1 | 25% of score | Until rumor is scored |
| Dispute rumor | 3 | 50% of score | Until resolution |
| Provide evidence | 0 | N/A | No lockup |

### 5.3 Slashing Conditions

**Individual Slash:** When a voter's BTS score is negative:

$$\text{penalty}_i = |S_i| \times \text{stakeAmount}_i \times \text{slashMultiplier}$$

Default `slashMultiplier` = 1.5 (lose more than you staked).

**Correlation-Aware Slash:** When a coordinated group all backs a false rumor:

$$\text{penalty}_{group} = \text{basePenalty} \times (1 + \log_2 |G|)$$

where $|G|$ is the cluster size. A group of 32 coordinated liars suffers a 6× penalty multiplier.

### 5.4 Reward Formula

When a voter's BTS score is positive:

$$\text{reward}_i = S_i \times \text{stakeAmount}_i \times \text{rewardMultiplier}$$

Default `rewardMultiplier` = 1.0 (can only recoup your stake + earn proportional to accuracy).

### 5.5 Score Bounds

```
MIN_SCORE = 0        // Cannot go negative (but effectively locked out)
MAX_SCORE = 1000     // Cap prevents runaway accumulation
RECOVERY_RATE = 0.1  // Zeroed users slowly recover to participate again
```

### 5.6 Implementation Interface

```javascript
class ReputationManager {
  constructor(db) {}  // OrbitDB reputation KVStore

  /** Get current trust score */
  getScore(nullifierId) → number

  /** Check if user can perform action */
  canStake(nullifierId, amount, action) → boolean

  /** Lock stake for pending action */
  lockStake(nullifierId, amount, actionId) → StakeLock

  /** Apply BTS result to all voters */
  applyScores(btsResult, rumorId) → SlashReport

  /** Time-based decay (called every epoch) */
  applyDecay(decayRate = 0.99) → void

  /** Recovery for zeroed-out users */
  applyRecovery(recoveryRate = 0.1) → void
}
```

---

## 6. Trust Propagator (Personalized PageRank)

### 6.1 Purpose

Allow each device to compute a **subjective** trust ranking based on its own "trust seeds." This prevents any single entity (including the university) from dictating truth globally.

### 6.2 Algorithm

**Standard PageRank:**

$$PR(u) = \frac{1-d}{N} + d \sum_{v \in B_u} \frac{PR(v)}{L(v)}$$

where $d$ = damping factor (0.85), $B_u$ = set of pages linking to $u$, $L(v)$ = outgoing links from $v$.

**Personalized PageRank (PPR):**

$$PPR(u) = (1-d) \cdot \vec{p}(u) + d \sum_{v \in B_u} \frac{PPR(v)}{L(v)}$$

where $\vec{p}$ is the **personalization vector** (restart distribution) instead of uniform $\frac{1}{N}$.

### 6.3 Trust Graph Construction

Nodes in the trust graph are voter identities (represented by nullifier-derived IDs). Edges represent positive scoring interactions:

- Voter A and Voter B both correctly voted TRUE on Rumor R → edge between A and B
- Voter C provided official proof that confirmed Rumor R → incoming edges to C from all correct voters

Edge weight = sum of co-correct BTS scores.

### 6.4 Personalization Vector

Each device defines its own personalization vector $\vec{p}$:

```javascript
// Default: trust all verified students equally
const defaultSeeds = { '*': 1.0 / N };

// Custom: trust student witnesses more than admin signals
const customSeeds = {
  'student_verified': 0.7,
  'admin_verified': 0.2,
  'official_proof': 0.1
};

// Blocking: remove university's influence entirely
const blockingSeeds = {
  'student_verified': 0.9,
  'admin_verified': 0.0,    // blocked
  'official_proof': 0.1
};
```

### 6.5 Subjective Epistemic Forks

Because PPR is computed locally, two students with different trust seeds will see different trust scores for the same rumor. This is by design:

- Student A trusts the university → sees admin-confirmed rumors as high-trust
- Student B distrusts the university → sees the same rumors as low-trust
- Neither is "wrong" — the system respects subjective epistemic sovereignty

### 6.6 Implementation Interface

```javascript
class TrustPropagator {
  constructor(dampingFactor = 0.85, maxIterations = 100, tolerance = 1e-6) {}

  /**
   * Build trust graph from vote history
   * @param {Map<string, Vote[]>} voteHistory
   * @param {Map<string, BTSResult>} scoreHistory
   * @returns {TrustGraph}
   */
  buildGraph(voteHistory, scoreHistory) → TrustGraph

  /**
   * Compute Personalized PageRank
   * @param {TrustGraph} graph
   * @param {Map<string, number>} trustSeeds - personalization vector
   * @returns {Map<string, number>} - PPR scores per voter
   */
  computePPR(graph, trustSeeds) → Map<string, number>

  /**
   * Get final weighted trust score for a rumor
   * @param {string} rumorId
   * @param {Map<string, number>} pprScores
   * @returns {number} - 0-100 trust score
   */
  getRumorTrust(rumorId, pprScores) → number
}
```

---

## 7. Scoring Pipeline (End-to-End)

When a new vote arrives for a rumor, the full scoring pipeline runs:

```
1. FETCH all votes for this rumor from OrbitDB votes EventLog
                    │
2. FETCH vote history for all voters (for correlation check)
                    │
3. RUN CorrelationDampener.dampen(votes, history)
     → Output: DampenedVote[] with weights
                    │
4. CHECK population size N (count of unique dampened voters)
                    │
     ┌──────────────┴──────────────┐
     │ N ≥ 30                      │ N < 30
     ▼                             ▼
5a. BTSEngine.calculate()     5b. RBTSEngine.calculate()
     │                             │
     └──────────────┬──────────────┘
                    │
6. ReputationManager.applyScores(btsResult, rumorId)
     → Rewards honest voters, slashes liars
                    │
7. TrustPropagator.buildGraph() → computePPR()
     → Updates subjective trust map
                    │
8. STORE updated scores in OrbitDB reputation KVStore
                    │
9. EMIT 'score-updated' event for any listeners
```

---

## 8. Edge Cases & Handling

| Edge Case | Handling |
|-----------|----------|
| Only 1-2 voters on a rumor | Score remains "UNVERIFIED"; no BTS/RBTS runs |
| All voters agree (ρ = 1.0) | No dampening needed (same opinion ≠ coordination) unless cross-rumor pattern exists |
| Voter has score = 0 | Cannot vote (insufficient stake); recovers slowly |
| Official proof contradicts majority | BTS math rewards the minority who were correct; majority gets slashed |
| log(0) in BTS formula | Predictions are floored at ε = 0.001 to avoid -∞ |
| Tombstoned rumor receives vote | Vote is rejected (E010) |
| Two rumors about same topic | Scored independently; reputation carries across |
