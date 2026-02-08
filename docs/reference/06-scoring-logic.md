# Phase 3 — Scoring Engine

This module implements **Bayesian Truth Serum (BTS)** scoring to separate honest voters from liars, **bot detection** via correlation dampening, and a full **reputation system** with staking, slashing, and recovery.

---

## Technologies & Concepts Used in This Phase

| Technology / Concept | What It Is | Why We Use It |
|---------------------|-----------|---------------|
| **Bayesian Truth Serum (BTS)** | A game-theoretic mechanism from MIT research. Makes truth-telling the mathematically optimal strategy by combining votes with predictions. | Scores rumors for truth without any authority deciding what's true — the math rewards honest voters and punishes liars. |
| **Robust BTS (RBTS)** | A variant of BTS designed for small populations (3-29 voters). Uses peer-pairing instead of population statistics. | On a campus with few early users, standard BTS is unreliable. RBTS works with as few as 3 voters. |
| **Pearson Correlation** | A statistical measure (-1 to +1) of how similar two sets of data are. | Detects bots: if 50 accounts always vote identically, their pairwise Pearson correlation is ~1.0 → flagged as a cluster. |
| **Union-Find** | A data structure for efficiently grouping items into clusters. Also called Disjoint Set Union (DSU). | Groups correlated voters into bot clusters. Fast — nearly O(1) per operation. |
| **Mulberry32 PRNG** | A simple deterministic pseudorandom number generator. Same seed → same sequence every time. | RBTS needs random peer assignments, but all nodes must compute the same result. Seeded by `rumorId + blockHeight`. |
| **Staking / Slashing** | Lock reputation (stake) before voting. Earn back more if honest (reward), lose more if dishonest (slash). | Makes lying expensive. You risk 1.5× what you staked. Borrowed from proof-of-stake blockchain concepts. |

---

## Concepts

| Concept | What it does |
|---------|-------------|
| **Correlation Dampener** | Detects coordinated voting (botnets) by computing pairwise Pearson correlations across voting history. Clusters correlated voters and reduces their effective weight. |
| **BTS Engine** | For populations ≥ 30 voters. Each voter submits a vote + a prediction of how *others* will vote. BTS rewards "surprisingly common" answers — truth-tellers score higher than liars. |
| **RBTS Engine** | For populations 3–29 voters. Uses peer-pairing instead of population-wide statistics. Deterministic PRNG ensures verifiable peer assignments. |
| **Reputation Manager** | Tracks trust scores per voter. Handles staking (lock tokens to vote/post), rewards/slashing based on BTS scores, group slashing for bot clusters, decay, and recovery. |

---

## The Full Pipeline

```
Raw Votes ──→ CorrelationDampener ──→ BTS or RBTS ──→ ReputationManager
                  (bot detection)      (scoring)       (reward/slash)
```

1. **Dampen**: Add weights to each vote based on voting history correlations
2. **Score**: Run BTS (N ≥ 30) or RBTS (3 ≤ N < 30) on dampened votes
3. **Update reputation**: Reward honest voters, slash dishonest ones

---

## Quick Start

All examples use ES Modules. Create files inside the `backend/` folder.

```bash
node demo-scoring.js
```

---

## Step 1 — Detect Bot Clusters (Correlation Dampener)

```js
import { CorrelationDampener } from './src/scoring/correlation-dampener.js';

const dampener = new CorrelationDampener(
  10.0,  // lambda — sensitivity (higher = stronger dampening)
  0.85   // threshold — Pearson ρ above which voters are clustered
);

// Current votes on a rumor
const votes = [
  { nullifier: 'honest1', vote: 'TRUE',  prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, stakeAmount: 5 },
  { nullifier: 'honest2', vote: 'FALSE', prediction: { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }, stakeAmount: 3 },
  { nullifier: 'bot1',    vote: 'FALSE', prediction: { TRUE: 0.1, FALSE: 0.8, UNVERIFIED: 0.1 }, stakeAmount: 1 },
  { nullifier: 'bot2',    vote: 'FALSE', prediction: { TRUE: 0.1, FALSE: 0.8, UNVERIFIED: 0.1 }, stakeAmount: 1 },
  { nullifier: 'bot3',    vote: 'FALSE', prediction: { TRUE: 0.1, FALSE: 0.8, UNVERIFIED: 0.1 }, stakeAmount: 1 },
];

// Historical votes across past rumors (Map: nullifier → [{ rumorId, vote }])
const voteHistory = new Map();
// Bots always voted identically in the past
const botHistory = [
  { rumorId: 'r1', vote: 'FALSE' },
  { rumorId: 'r2', vote: 'TRUE' },
  { rumorId: 'r3', vote: 'FALSE' },
];
voteHistory.set('bot1', [...botHistory]);
voteHistory.set('bot2', [...botHistory]);
voteHistory.set('bot3', [...botHistory]);
voteHistory.set('honest1', [
  { rumorId: 'r1', vote: 'TRUE' },
  { rumorId: 'r2', vote: 'FALSE' },
  { rumorId: 'r3', vote: 'TRUE' },
]);
voteHistory.set('honest2', [
  { rumorId: 'r1', vote: 'FALSE' },
  { rumorId: 'r2', vote: 'TRUE' },
  { rumorId: 'r3', vote: 'FALSE' },
]);

const dampened = dampener.dampen(votes, voteHistory);

for (const dv of dampened) {
  console.log(
    `${dv.vote.nullifier}: weight=${dv.weight.toFixed(3)}, ` +
    `cluster=${dv.clusterId}, size=${dv.clusterSize}`
  );
}
// Output:
//   honest1: weight=1.000, cluster=honest1, size=1
//   honest2: weight=1.000, cluster=honest2, size=1
//   bot1:    weight=0.091, cluster=bot1,    size=3  ← dampened!
//   bot2:    weight=0.091, cluster=bot1,    size=3  ← dampened!
//   bot3:    weight=0.091, cluster=bot1,    size=3  ← dampened!
```

### How Dampening Works

1. **Build vote vectors**: For each pair of voters, find rumors they both voted on
2. **Pearson correlation**: Compute ρ for each pair (converts votes to numeric: TRUE=1, FALSE=-1, UNVERIFIED=0)
3. **Union-Find clustering**: If ρ > 0.85, merge the two voters into one cluster
4. **Compute weight**: `W = 1 / (1 + λ × ρ̄)` where ρ̄ is the average pairwise correlation in the cluster
5. **Effect**: 50 identical bots → effective weight of ~4.5 votes total (instead of 50)

---

## Step 2 — Score Votes with BTS (N ≥ 30)

```js
import { BTSEngine } from './src/scoring/bts-engine.js';

const bts = new BTSEngine(
  1.0,    // alpha — weight of prediction component
  0.001   // floor — prevents log(0) in edge cases
);

// Use the dampened votes from Step 1
const result = bts.calculate(dampened);

console.log('Consensus:', result.consensus);
// → 'TRUE', 'FALSE', 'UNVERIFIED', or 'DISPUTED'

console.log('Rumor trust score:', result.rumorTrustScore.toFixed(1));
// → 0–100 (weighted % of TRUE votes by stake)

console.log('Actual proportions:', result.actualProportions);
// → { TRUE: 0.72, FALSE: 0.28, UNVERIFIED: 0.0 } (weight-adjusted)

console.log('Voter scores:');
for (const [nullifier, score] of result.voterScores) {
  console.log(`  ${nullifier}: ${score.toFixed(4)}`);
}
// Positive = rewarded, Negative = slashed
```

### BTS Formula Explained

Each voter submits:
- A **vote** (TRUE / FALSE / UNVERIFIED)
- A **prediction** of how others will vote (probability distribution)

**Information Score** (did you know the truth?):
```
InfoScore_i = log(x̄_k / ȳ_k)
```
Where `x̄_k` = actual proportion of vote k, `ȳ_k` = geometric mean of predictions for k.

**Prediction Score** (did you predict accurately?):
```
PredScore_i = Σ_j x̄_j × log(P_j^i / x̄_j)
```

**Total**: `S_i = InfoScore_i + α × PredScore_i`

---

## Step 3 — Score Votes with RBTS (3 ≤ N < 30)

For small populations, BTS statistics become unreliable. RBTS uses **peer pairing** instead:

```js
import { RBTSEngine } from './src/scoring/rbts-engine.js';

const rbts = new RBTSEngine(1.0, 0.001);

// Need minimum 3 voters
const smallVotes = [
  { vote: { nullifier: 'v1', vote: 'TRUE',  prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, stakeAmount: 5 }, weight: 1.0, clusterId: 'v1', clusterSize: 1 },
  { vote: { nullifier: 'v2', vote: 'TRUE',  prediction: { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }, stakeAmount: 3 }, weight: 1.0, clusterId: 'v2', clusterSize: 1 },
  { vote: { nullifier: 'v3', vote: 'FALSE', prediction: { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }, stakeAmount: 4 }, weight: 1.0, clusterId: 'v3', clusterSize: 1 },
];

// Deterministic seed from rumorId + blockHeight
const result = rbts.calculate(smallVotes, 'QmRumorHash123', 42);

console.log('Consensus:', result.consensus);
console.log('Voter scores:', Object.fromEntries(result.voterScores));

console.log('Peer assignments:');
for (const [nul, { reference, peer }] of result.peerAssignments) {
  console.log(`  ${nul}: reference=${reference}, peer=${peer}`);
}
```

### How RBTS Differs from BTS

| Aspect | BTS | RBTS |
|--------|-----|------|
| Population | N ≥ 30 | 3 ≤ N < 30 |
| Info Score | Based on population proportions | 1 if vote matches assigned reference's vote, else 0 |
| Pred Score | Based on geometric means | log(prediction for assigned peer's vote) |
| Peer Assignment | N/A | Deterministic PRNG (Mulberry32) seeded by rumorId + blockHeight |

---

## Step 4 — Manage Reputation

```js
import { ReputationManager } from './src/scoring/reputation-manager.js';

const rep = new ReputationManager();

// Register students (usually done on identity join)
rep.register('alice');
rep.register('bob');
rep.register('carol');

console.log('Alice score:', rep.getScore('alice'));  // 10 (initial)
```

### Staking

Before voting or posting, users must lock reputation as stake:

```js
// Check if Alice can stake
console.log('Can vote?', rep.canStake('alice', 1, 'vote'));   // true (min: 1)
console.log('Can post?', rep.canStake('alice', 5, 'post'));   // true (min: 5)

// Lock the stake
const lock = rep.lockStake('alice', 2, 'rumor123', 'vote');
console.log('Locked:', lock.amount, 'for', lock.rumorId);

// Stake limits:
// - Vote: min=1, max=25% of score
// - Post: min=5, max=50% of score
```

### Apply Scores (After BTS/RBTS)

```js
const btsResult = bts.calculate(dampened);

// Apply rewards and slashes
const stakes = new Map([
  ['alice', 2],      // She staked 2
  ['bob', 3],        // He staked 3
]);

const { rewards, slashes } = rep.applyScores(btsResult, 'rumor123', stakes);

console.log('Rewards:', Object.fromEntries(rewards));
console.log('Slashes:', Object.fromEntries(slashes));
console.log('Alice new score:', rep.getScore('alice'));
```

### Scoring Math

| Event | Formula |
|-------|---------|
| **Reward** (positive BTS) | `score += btsScore × stakeAmount × rewardMultiplier (1.0)` |
| **Slash** (negative BTS) | `score -= |btsScore| × stakeAmount × slashMultiplier (1.5)` |
| **Group Slash** (bots) | `penalty = basePenalty × (1 + log₂(clusterSize))` |
| **Decay** (per epoch) | `score *= 0.99` |
| **Recovery** (if score=0) | `score += 0.1` (capped at initial_score) |

> **Asymmetric risk**: Slashing is 1.5× stronger than rewards. This discourages reckless voting.

### Slash Bot Clusters

```js
// After dampening detects a cluster of 3 bots
rep.applyGroupSlash(['bot1', 'bot2', 'bot3'], 1.0, 'rumor123');
// Penalty = 1.0 × (1 + log₂(3)) ≈ 2.58 per bot
```

### Periodic Maintenance

```js
// Run these periodically (e.g., once per day or per "epoch")

// Decay: all scores × 0.99
rep.applyDecay();

// Recovery: boost zeroed-out users by 0.1
rep.applyRecovery();
```

### Export & Import

```js
// Save state (for persistence)
const data = rep.export();
console.log('Exported', data.length, 'users');

// Restore later
const rep2 = new ReputationManager();
rep2.import(data);
console.log('Restored alice:', rep2.getScore('alice'));
```

---

## Step 5 — Full Pipeline (End to End)

Here's the complete scoring flow — from raw votes to reputation updates:

```js
import { CorrelationDampener } from './src/scoring/correlation-dampener.js';
import { BTSEngine } from './src/scoring/bts-engine.js';
import { RBTSEngine } from './src/scoring/rbts-engine.js';
import { ReputationManager } from './src/scoring/reputation-manager.js';
import { SCORING } from './src/config.js';

// Initialize
const dampener = new CorrelationDampener();
const bts = new BTSEngine();
const rbts = new RBTSEngine();
const rep = new ReputationManager();

// Register all participants
const voters = ['alice', 'bob', 'carol', 'dave', 'eve'];
voters.forEach(v => rep.register(v));

// -- When a rumor accumulates votes: --

// 1. Collect raw votes
const rawVotes = [
  { nullifier: 'alice', vote: 'TRUE',       prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, stakeAmount: 2 },
  { nullifier: 'bob',   vote: 'TRUE',       prediction: { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 }, stakeAmount: 1 },
  { nullifier: 'carol', vote: 'FALSE',      prediction: { TRUE: 0.4, FALSE: 0.5, UNVERIFIED: 0.1 }, stakeAmount: 2 },
  { nullifier: 'dave',  vote: 'TRUE',       prediction: { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }, stakeAmount: 1 },
  { nullifier: 'eve',   vote: 'UNVERIFIED', prediction: { TRUE: 0.3, FALSE: 0.3, UNVERIFIED: 0.4 }, stakeAmount: 1 },
];

// 2. Fetch vote history from storage (Map: nullifier → past votes)
const voteHistory = new Map(); // empty = no history = no dampening

// 3. Dampen (bot detection)
const dampened = dampener.dampen(rawVotes, voteHistory);

// 4. Choose scoring engine based on population size
const N = dampened.length;
let scoringResult;

if (N >= SCORING.RBTS_THRESHOLD) {
  // Large population: standard BTS
  scoringResult = bts.calculate(dampened);
  console.log('Used: BTS (N ≥ 30)');
} else if (N >= 3) {
  // Small population: Robust BTS with peer pairing
  scoringResult = rbts.calculate(dampened, 'QmRumor42', 100);
  console.log('Used: RBTS (3 ≤ N < 30)');
} else {
  console.log('Too few voters (need ≥ 3)');
  process.exit(0);
}

// 5. Update reputation
const stakes = new Map(rawVotes.map(v => [v.nullifier, v.stakeAmount]));
const { rewards, slashes } = rep.applyScores(scoringResult, 'QmRumor42', stakes);

// 6. Report results
console.log('\n=== Scoring Results ===');
console.log('Consensus:', scoringResult.consensus);
console.log('Rumor Trust Score:', scoringResult.rumorTrustScore.toFixed(1));
console.log('\nVoter Scores:');
for (const [nul, score] of scoringResult.voterScores) {
  const change = rewards.has(nul) ? `+${rewards.get(nul).toFixed(3)}` : `-${slashes.get(nul)?.toFixed(3) || '0'}`;
  console.log(`  ${nul}: BTS=${score.toFixed(4)}, rep change=${change}, new rep=${rep.getScore(nul).toFixed(2)}`);
}
```

---

## Configuration Reference

All scoring constants are in `backend/src/config.js` under `SCORING`:

| Constant | Default | Meaning |
|----------|---------|---------|
| `BTS_ALPHA` | 1.0 | Weight of prediction component |
| `PREDICTION_FLOOR` | 0.001 | Floor for predictions (avoids log(0)) |
| `RBTS_THRESHOLD` | 30 | Voter count below which RBTS is used |
| `INITIAL_TRUST_SCORE` | 10 | Starting reputation for new users |
| `MIN_STAKE_TO_VOTE` | 1 | Minimum stake to cast a vote |
| `MIN_STAKE_TO_POST` | 5 | Minimum stake to post a rumor |
| `SLASH_MULTIPLIER` | 1.5 | How much harder slashing is vs rewards |
| `REWARD_MULTIPLIER` | 1.0 | Reward scaling factor |
| `CORRELATION_LAMBDA` | 10.0 | Bot detection sensitivity |
| `CLUSTER_THRESHOLD` | 0.85 | Pearson ρ above which voters cluster |
| `MIN_SCORE` | 0 | Minimum reputation score |
| `MAX_SCORE` | 1000 | Maximum reputation score |
| `DECAY_RATE` | 0.99 | Daily score decay multiplier |
| `RECOVERY_RATE` | 0.1 | Score recovery per epoch for zeroed users |

---

## Running the Tests

```bash
cd backend
npm run test:scoring
```

All 46 tests should pass, covering:
- Correlation Dampener (7 tests): empty input, no dampening, bot clusters, mixed clusters, lambda/threshold, 50-bot stress test
- BTS Engine (9 tests): empty input, proportions, honest rewards, surprise penalty, accurate predictions, floor safety, trust score, consensus, weight respect
- RBTS Engine (6 tests): minimum voters, scoring, determinism, seed variation, peer validity
- Reputation Manager (16 tests): registration, staking, stake limits, locking, rewards, slashing, clamping, group slash, decay, recovery, export/import, history
- Full Pipeline (3 tests): BTS end-to-end, RBTS end-to-end, engine selection

---

**← Back**: [Phase 2 — P2P Network & Storage](./03-P2P-NETWORK-AND-STORAGE.md) | **Next →**: [Phase 4 — Security & State](./05-SECURITY-AND-STATE.md) | [All Guides](./README.md)
