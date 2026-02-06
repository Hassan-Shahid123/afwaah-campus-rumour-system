# Phase 4 — Security & State Management

This module handles the **hardening** of the system: logical deletion of rumors (tombstones), periodic state rebuilds (snapshotter), subjective trust rankings (Personalized PageRank), and syncing nodes that went offline (anti-entropy).

---

## Technologies & Concepts Used in This Phase

| Technology / Concept | What It Is | Why We Use It |
|---------------------|-----------|---------------|
| **OpLog (Operation Log)** | An append-only log of all operations (add rumor, add vote, etc.) stored in OrbitDB's Merkle-DAG. | The single source of truth. Even deletions are appended (not erased). You can always rebuild the current state by replaying the log. |
| **Tombstone Deletion** | A pattern from distributed systems: instead of deleting data, you append a "tombstone" marker that says "this entry is logically deleted." | In an append-only system you can't truly delete. Tombstones let us mark rumors as removed while keeping the log intact. |
| **Materialized View** | A pre-computed snapshot of the current state (all active rumors, scores, tallies) derived from the OpLog. | Faster reads — instead of replaying the entire log every time, you read from a cached snapshot. |
| **PageRank** | Google's algorithm for ranking web pages by importance based on link structure. | We adapt it to rank voter trustworthiness — voters who consistently agree with other honest voters get higher trust. |
| **Personalized PageRank (PPR)** | A variant where each node starts with its own "trust seeds" instead of uniform distribution. | Each device can have a different trust perspective. Student A might trust official sources; Student B might not. Both are valid. |
| **Merkle Tree Diff** | Comparing the Merkle roots of two datasets to find exactly which entries differ. | When a node reconnects after being offline, we compare Merkle trees to find only the missing data — much faster than syncing everything. |
| **Anti-Entropy** | A synchronization protocol where nodes periodically exchange state summaries to detect and fix inconsistencies. | Ensures all peers eventually converge to the same data, even after network partitions or offline periods. |
| **Delta Sync** | Transferring only the differences between two datasets, not the full dataset. | Bandwidth-efficient — a reconnecting node only downloads what it missed, not the entire database. |

---

## The Problem This Phase Solves

Before Phase 4, the system had three critical gaps:

1. **Ghost Dependency Bug** — If a rumor was "deleted," the votes and reputation changes from that rumor still lingered in the system like phantom scores
2. **No way to delete rumors** — Append-only logs can't remove entries
3. **No offline recovery** — A student whose phone was off for a day had no way to catch up efficiently
4. **No subjective trust** — Everyone saw the same trust scores, even when they might disagree on what sources to trust

---

## Step 1 — Tombstone Manager (Logical Deletion)

The `TombstoneManager` handles "deleting" rumors in an append-only system.

### How It Works

```js
import { TombstoneManager } from './src/state/tombstone-manager.js';

const tm = new TombstoneManager();

// Add a tombstone — only the original author can do this
// (verified by matching the author's nullifier)
tm.addTombstone('rumor-123', 'author-nullifier-abc', 'retracted');

// Check if a rumor is tombstoned
console.log(tm.isTombstoned('rumor-123'));  // true
console.log(tm.isTombstoned('rumor-456'));  // false

// Get tombstone details
const info = tm.getTombstone('rumor-123');
console.log(info);
// { rumorId: 'rumor-123', author: 'author-nullifier-abc',
//   reason: 'retracted', timestamp: 1738800000000 }
```

### Key Rules

- **Only the original author** can tombstone their own rumor (the nullifier must match)
- Valid reasons: `"retracted"`, `"duplicate"`, `"community_flagged"`
- Tombstoned rumors are **skipped** during score calculations
- The original data stays in the OpLog forever (append-only), but the tombstone marker tells the system to ignore it

### Configurable Options

Nothing to configure — tombstone behavior is defined by the protocol. The valid reasons are in `config.js` under `PROTOCOL.TYPES.TOMBSTONE`.

---

## Step 2 — Snapshotter (State Rebuild)

The `Snapshotter` periodically walks the entire OpLog and rebuilds the current state from scratch.

### How It Works

```js
import { Snapshotter } from './src/state/snapshotter.js';

// Create a snapshotter that rebuilds every 10 operations
const snapshotter = new Snapshotter({ snapshotInterval: 10 });

// Simulate operations being added to the OpLog
const opLog = [
  { type: 'ADD_RUMOR', data: { rumorId: 'r1', text: 'Free pizza!' } },
  { type: 'ADD_VOTE', data: { rumorId: 'r1', vote: 'TRUE', voter: 'alice' } },
  { type: 'ADD_VOTE', data: { rumorId: 'r1', vote: 'FALSE', voter: 'bob' } },
  { type: 'TOMBSTONE', data: { rumorId: 'r1' } },
  // ... more operations
];

// Rebuild the materialized view
const snapshot = snapshotter.rebuild(opLog, tombstoneSet);

// The snapshot contains the current state:
// - Active rumors (excluding tombstoned ones)
// - Current vote tallies
// - Computed reputation scores
```

### Why It Exists

In a distributed system, the **OpLog is the ground truth** — all operations ever performed are recorded there. But reading through thousands of operations every time you need the current state is slow.

The snapshotter solves this:
1. Every N operations (default: 10), it walks the entire log
2. It skips tombstoned entries
3. It builds a fresh **materialized view** — a snapshot of the current state
4. If the snapshot ever gets corrupted → discard it → rebuild from the OpLog

### Configurable Options

In `config.js`:
```javascript
STORAGE: {
  SNAPSHOT_INTERVAL: 10,  // Rebuild every N operations. Lower = more consistent, Higher = faster
}
```

---

## Step 3 — Trust Propagator (Personalized PageRank)

The `TrustPropagator` computes a **subjective** trust ranking for each device using Personalized PageRank.

### How It Works

```js
import { TrustPropagator } from './src/scoring/trust-propagator.js';

const propagator = new TrustPropagator(
  0.85,    // damping factor (probability of following a link vs. teleporting)
  100,     // max iterations
  1e-6     // convergence tolerance
);

// Build a trust graph from voting history
// Nodes = voter identities, Edges = co-correct voting interactions
const graph = new Map();

// Alice and Bob both correctly voted TRUE on rumor 1
// → Create an edge between them (weight = BTS score)
graph.set('alice', [
  { target: 'bob', weight: 0.5 },
  { target: 'carol', weight: 0.3 },
]);
graph.set('bob', [
  { target: 'alice', weight: 0.5 },
]);
graph.set('carol', [
  { target: 'alice', weight: 0.3 },
]);

// Define YOUR trust seeds (personalization vector)
// This is what makes it "personalized" — different students can have different seeds
const myTrustSeeds = new Map([
  ['alice', 0.5],   // I trust Alice a lot
  ['bob', 0.3],     // I trust Bob somewhat
  ['carol', 0.2],   // I trust Carol a little
]);

// Compute PageRank
const pprScores = propagator.computePPR(graph, myTrustSeeds);

for (const [voter, score] of pprScores) {
  console.log(`${voter}: PPR = ${score.toFixed(4)}`);
}
```

### Why It Matters

Without PageRank, everyone sees the same trust scores. With **Personalized** PageRank:

- **Student A** trusts official university sources → sees admin-confirmed rumors as high-trust
- **Student B** distrusts the university → sees the same rumors with much lower trust
- **Neither is "wrong"** — the system respects **epistemic sovereignty** (the right to your own trust model)

This prevents any single entity from dictating "the truth" for everyone.

### Configurable Options

```javascript
// In your TrustPropagator constructor:
new TrustPropagator(
  0.85,    // dampingFactor — higher = more weight to graph structure (vs. trust seeds)
  100,     // maxIterations — convergence usually happens in 20-30 iterations
  1e-6     // tolerance — convergence threshold
);
```

---

## Step 4 — Anti-Entropy Sync (Offline Recovery)

The `AntiEntropySync` module handles what happens when a node goes offline and comes back.

### The Problem

Imagine your phone was off for 24 hours. During that time, 50 new rumors were posted and 200 votes were cast. How do you catch up efficiently?

### How It Works

```js
import { AntiEntropySync } from './src/network/anti-entropy.js';

const sync = new AntiEntropySync();

// When reconnecting to a peer:
// 1. Exchange Merkle roots (compact representation of your data)
const myRoot = sync.computeMerkleRoot(myLocalData);
const peerRoot = peer.getMerkleRoot();

// 2. If roots differ → identify exactly which entries are missing
if (myRoot !== peerRoot) {
  const diff = sync.computeDiff(myLocalData, peerData);
  
  // 3. Delta sync — only download the missing entries
  for (const missingEntry of diff.missing) {
    await sync.fetchAndApply(missingEntry, peer);
  }
}

// 4. Read-repair: if local state is stale, rebuild from synced OpLog
sync.readRepair(localState, opLog);
```

### Why Merkle Trees?

A Merkle tree is like a fingerprint of your entire dataset compressed into a single hash (the root). If two nodes have different roots, they can walk down the tree branches to find exactly which entries differ — without comparing every single entry.

**Example:** If you have 10,000 entries and missed 3, the Merkle diff finds those 3 in O(log N) comparisons, not 10,000.

### Configurable Options

In `config.js`:
```javascript
NETWORK: {
  SYNC_COOLDOWN: 30000,  // ms between sync requests (prevent spam)
}
```

---

## Full Pipeline (Phase 4 in Action)

Here's how all Phase 4 modules work together in a real scenario:

```
Scenario: Student deletes a rumor they posted yesterday

1. Student creates removal request
   → TombstoneManager validates they're the original author (nullifier check)
   → Tombstone appended to OpLog

2. Snapshotter triggers (every 10 operations)
   → Walks entire OpLog
   → Encounters the tombstone → skips that rumor and its votes
   → Rebuilds reputation scores WITHOUT the deleted rumor's influence
   → Ghost Dependency Bug eliminated

3. Trust Propagator runs
   → Rebuilds trust graph (excludes tombstoned interactions)
   → Each device computes new Personalized PageRank scores

4. Another student reconnects after being offline
   → AntiEntropySync compares Merkle roots with a peer
   → Finds the tombstone + any new rumors/votes
   → Delta syncs just the missing entries
   → Rebuilds local state from updated OpLog
```

---

## Running the Tests

```bash
cd backend
npx --node-options="--experimental-vm-modules" jest tests/integration.test.js --verbose --forceExit
```

All 80 tests should pass, covering:

- **Snapshotter** (15 tests): OpLog traversal, tombstone skipping, materialized view rebuild, periodic triggers, state consistency
- **Tombstone Manager** (12 tests): Creation, author validation, duplicate handling, reason validation, query operations
- **Trust Propagator** (18 tests): Graph construction, PPR computation, convergence, custom trust seeds, edge weights, subjective forks
- **Anti-Entropy Sync** (15 tests): Merkle root computation, diff detection, delta sync, read-repair, cooldown enforcement
- **Full Integration Pipeline** (20 tests): Join → post → vote → score → delete → rescore → sync, end-to-end flow across all 4 phases

---

## Files in This Phase

| File | Class | Purpose |
|------|-------|---------|
| `state/snapshotter.js` | `Snapshotter` | Periodic OpLog re-traversal, materialized view rebuild |
| `state/tombstone-manager.js` | `TombstoneManager` | Logical deletion with author validation |
| `scoring/trust-propagator.js` | `TrustPropagator` | Personalized PageRank for subjective trust |
| `network/anti-entropy.js` | `AntiEntropySync` | Merkle diff sync for reconnecting nodes |
| `tests/integration.test.js` | — | 80 integration tests covering all Phase 4 modules + full pipeline |

---

**← Back**: [Phase 3 — Scoring Engine](./04-SCORING-ENGINE.md) | [All Guides](./README.md)
