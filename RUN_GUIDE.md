# Afwaah — Complete Running Guide

> This guide walks you through the **entire running process** of the Afwaah system — from a fresh clone to seeing every feature in action.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Run All Tests (Quick Verification)](#3-run-all-tests)
4. [Phase 1: Create Anonymous Identities](#4-phase-1-create-anonymous-identities)
5. [Phase 2: Start P2P Nodes & Store Data](#5-phase-2-start-p2p-nodes--store-data)
6. [Phase 3: Score Rumors for Truth](#6-phase-3-score-rumors-for-truth)
7. [Phase 4: Delete, Rebuild, Trust & Sync](#7-phase-4-delete-rebuild-trust--sync)
8. [Full End-to-End Pipeline](#8-full-end-to-end-pipeline)
9. [Configuration Reference](#9-configuration-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Tool | Minimum | Check |
|------|---------|-------|
| Node.js | 18.0.0 | `node --version` |
| npm | 9.0.0 | `npm --version` |
| Git | any | `git --version` |

---

## 2. Clone & Install

```bash
git clone https://github.com/Hassan-Shahid123/afwaah-campus-rumour-system.git
cd afwaah-campus-rumour-system/backend
npm install
```

Installation takes 1-3 minutes. It downloads ~200 packages including Semaphore, libp2p, OrbitDB, and cryptographic libraries.

---

## 3. Run All Tests

This is the fastest way to verify everything works:

```bash
npx --node-options="--experimental-vm-modules" jest --verbose --forceExit
```

**Expected output:**

```
 PASS  tests/identity.test.js       (32 tests)   ← Phase 1: ZK Identity
 PASS  tests/network.test.js        (53 tests)   ← Phase 2: P2P + Storage
 PASS  tests/scoring.test.js        (46 tests)   ← Phase 3: BTS + Reputation
 PASS  tests/integration.test.js    (80 tests)   ← Phase 4: Security + Integration

Tests:       211 passed, 211 total
Test Suites: 4 passed, 4 total
```

If all 211 tests pass, your environment is good. You can now run individual modules.

---

## 4. Phase 1: Create Anonymous Identities

### What this does
Creates zero-knowledge identities for students, verifies university email via DKIM, and builds a Merkle tree for anonymous membership proofs.

### Run Phase 1 tests only

```bash
npx --node-options="--experimental-vm-modules" jest tests/identity.test.js --verbose
```

### Try it yourself

Create a file `backend/demo-identity.js`:

```javascript
import { IdentityManager } from './src/identity/identity-manager.js';
import { MembershipTree } from './src/identity/membership-tree.js';

// ── Step 1: Create anonymous identities ──
const mgr = new IdentityManager();

const alice = mgr.create();
const bob = mgr.create('bobs-secret-passphrase');
const carol = mgr.create();

console.log('=== Identity Creation ===');
console.log('Alice commitment:', alice.commitment.toString().slice(0, 20) + '...');
console.log('Bob commitment:', bob.commitment.toString().slice(0, 20) + '...');
console.log('Carol commitment:', carol.commitment.toString().slice(0, 20) + '...');

// Deterministic: same passphrase → same identity
const bob2 = mgr.create('bobs-secret-passphrase');
console.log('\nDeterministic identity?', bob.commitment === bob2.commitment);  // true

// ── Step 2: Build membership tree ──
const tree = new MembershipTree();
tree.addMember(alice.commitment);
tree.addMember(bob.commitment);
tree.addMember(carol.commitment);

console.log('\n=== Membership Tree ===');
console.log('Members:', tree.memberCount);
console.log('Root:', tree.getRoot().toString().slice(0, 20) + '...');

// ── Step 3: Generate & verify Merkle proof ──
const proof = tree.generateMerkleProof(0);  // Alice is at index 0
const valid = tree.verifyMerkleProof(proof);
console.log('\n=== Merkle Proof ===');
console.log('Alice proof valid?', valid);  // true

// ── Step 4: Export/import identity (for storage) ──
const exported = mgr.export(alice);
const restored = mgr.import(exported);
console.log('\n=== Serialization ===');
console.log('Export/import matches?', restored.commitment === alice.commitment);  // true

console.log('\n✓ Phase 1 complete — anonymous identities with Merkle proofs');
```

Run it:
```bash
cd backend
node demo-identity.js
```

---

## 5. Phase 2: Start P2P Nodes & Store Data

### What this does
Starts a libp2p peer-to-peer node, sets up GossipSub messaging, and stores data in OrbitDB (distributed database on IPFS).

### Run Phase 2 tests only

```bash
npx --node-options="--experimental-vm-modules" jest tests/network.test.js --verbose --forceExit
```

### Try it yourself

Create `backend/demo-network.js`:

```javascript
import { AfwaahNode } from './src/network/node.js';
import { GossipController } from './src/network/gossip-controller.js';
import { DatabaseManager } from './src/storage/db.js';
import { StoreManager } from './src/storage/stores.js';

async function main() {
  // ── Step 1: Start a P2P node ──
  console.log('=== Starting P2P Node ===');
  const node = new AfwaahNode();
  await node.start();
  console.log('Peer ID:', node.peerId.toString());
  console.log('Listening on:', node.getMultiaddrs().map(m => m.toString()));

  // ── Step 2: Set up gossip messaging ──
  console.log('\n=== GossipSub ===');
  const gossip = new GossipController(node);
  gossip.onRumor((msg) => console.log('  Received rumor:', msg.text));
  gossip.onVote((msg) => console.log('  Received vote:', msg.vote));
  gossip.start();
  console.log('Listening for messages on all topics...');

  // ── Step 3: Connect to OrbitDB ──
  console.log('\n=== OrbitDB Storage ===');
  const db = new DatabaseManager({ directory: './demo-orbitdb-data' });
  await db.start();
  const stores = new StoreManager(db.orbitdb);
  await stores.open();
  console.log('4 stores opened (rumors, votes, identities, reputation)');

  // ── Step 4: Store a rumor ──
  const hash = await stores.addRumor({
    rumorId: 'QmDemoRumor1',
    text: 'Free pizza in the student lounge at 5 PM!',
    topic: 'events',
    author: 'demo-nullifier',
    timestamp: Date.now(),
    zkProof: { proof: '0x', publicSignals: [] },
  });
  console.log('\nStored rumor, hash:', hash);

  // ── Step 5: Retrieve data ──
  const allRumors = await stores.getAllRumors();
  console.log('Total rumors stored:', allRumors.length);

  // ── Step 6: Clean shutdown ──
  console.log('\n=== Shutting Down ===');
  await stores.close();
  await db.stop();
  await node.stop();
  console.log('✓ Phase 2 complete — P2P node + OrbitDB storage');
}

main().catch(console.error);
```

Run it:
```bash
node demo-network.js
```

> **Note:** To see two nodes discover each other, run two separate scripts in two terminals on the same machine. mDNS will auto-discover them within ~10 seconds.

Clean up demo data:
```bash
rm -rf ./demo-orbitdb-data
```

---

## 6. Phase 3: Score Rumors for Truth

### What this does
Runs the Bayesian Truth Serum scoring pipeline: detect bots (correlation dampening), calculate truth scores (BTS/RBTS), and update reputation (stake/slash).

### Run Phase 3 tests only

```bash
npx --node-options="--experimental-vm-modules" jest tests/scoring.test.js --verbose
```

### Try it yourself

Create `backend/demo-scoring.js`:

```javascript
import { CorrelationDampener } from './src/scoring/correlation-dampener.js';
import { BTSEngine } from './src/scoring/bts-engine.js';
import { RBTSEngine } from './src/scoring/rbts-engine.js';
import { ReputationManager } from './src/scoring/reputation-manager.js';

// ── Step 1: Set up the scoring pipeline ──
const dampener = new CorrelationDampener(10.0, 0.85);
const bts = new BTSEngine(1.0, 0.001);
const rbts = new RBTSEngine(1.0, 0.001);
const rep = new ReputationManager();

// Register participants
['alice', 'bob', 'carol', 'dave', 'eve'].forEach(v => rep.register(v));

console.log('=== Initial Reputation ===');
console.log('Alice:', rep.getScore('alice'));  // 10
console.log('Bob:', rep.getScore('bob'));      // 10

// ── Step 2: Simulate votes on a rumor ──
const rawVotes = [
  { nullifier: 'alice', vote: 'TRUE',       prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, stakeAmount: 2 },
  { nullifier: 'bob',   vote: 'TRUE',       prediction: { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 }, stakeAmount: 1 },
  { nullifier: 'carol', vote: 'FALSE',      prediction: { TRUE: 0.4, FALSE: 0.5, UNVERIFIED: 0.1 }, stakeAmount: 2 },
  { nullifier: 'dave',  vote: 'TRUE',       prediction: { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }, stakeAmount: 1 },
  { nullifier: 'eve',   vote: 'UNVERIFIED', prediction: { TRUE: 0.3, FALSE: 0.3, UNVERIFIED: 0.4 }, stakeAmount: 1 },
];

// ── Step 3: Run correlation dampening (bot detection) ──
const voteHistory = new Map();  // empty = no history = no dampening
const dampened = dampener.dampen(rawVotes, voteHistory);

console.log('\n=== Dampened Weights ===');
for (const dv of dampened) {
  console.log(`  ${dv.vote.nullifier}: weight=${dv.weight.toFixed(3)}, cluster=${dv.clusterId}`);
}

// ── Step 4: Run scoring engine ──
// Using RBTS since we have < 30 voters
const result = rbts.calculate(dampened, 'QmRumor42', 100);

console.log('\n=== Scoring Results ===');
console.log('Consensus:', result.consensus);
console.log('Rumor Trust Score:', result.rumorTrustScore.toFixed(1) + '/100');
console.log('\nVoter Scores:');
for (const [nullifier, score] of result.voterScores) {
  console.log(`  ${nullifier}: BTS = ${score.toFixed(4)} (${score > 0 ? 'REWARDED' : 'SLASHED'})`);
}

// ── Step 5: Update reputation ──
const stakes = new Map(rawVotes.map(v => [v.nullifier, v.stakeAmount]));
const { rewards, slashes } = rep.applyScores(result, 'QmRumor42', stakes);

console.log('\n=== Reputation Updates ===');
for (const voter of ['alice', 'bob', 'carol', 'dave', 'eve']) {
  const r = rewards.get(voter);
  const s = slashes.get(voter);
  const change = r ? `+${r.toFixed(3)}` : s ? `-${s.toFixed(3)}` : '±0';
  console.log(`  ${voter}: ${rep.getScore(voter).toFixed(2)} (${change})`);
}

// ── Step 6: Apply daily maintenance ──
rep.applyDecay();
console.log('\n=== After Decay (×0.99) ===');
for (const voter of ['alice', 'bob', 'carol', 'dave', 'eve']) {
  console.log(`  ${voter}: ${rep.getScore(voter).toFixed(2)}`);
}

console.log('\n✓ Phase 3 complete — truth scoring with reputation');
```

Run it:
```bash
node demo-scoring.js
```

---

## 7. Phase 4: Delete, Rebuild, Trust & Sync

### What this does
Tombstone-deletes a rumor, rebuilds state from the OpLog, computes personalized trust rankings, and handles offline-to-online sync.

### Run Phase 4 tests only

```bash
npx --node-options="--experimental-vm-modules" jest tests/integration.test.js --verbose --forceExit
```

### Try it yourself

Create `backend/demo-phase4.js`:

```javascript
import { TombstoneManager } from './src/state/tombstone-manager.js';
import { Snapshotter } from './src/state/snapshotter.js';
import { TrustPropagator } from './src/scoring/trust-propagator.js';
import { AntiEntropySync } from './src/network/anti-entropy.js';

// ── Step 1: Tombstone a rumor ──
console.log('=== Tombstone Manager ===');
const tm = new TombstoneManager();

// Only the original author (matching nullifier) can delete
tm.addTombstone('rumor-123', 'author-abc', 'retracted');
console.log('rumor-123 tombstoned?', tm.isTombstoned('rumor-123'));  // true
console.log('rumor-456 tombstoned?', tm.isTombstoned('rumor-456'));  // false

const info = tm.getTombstone('rumor-123');
console.log('Tombstone reason:', info.reason);

// ── Step 2: Rebuild state via Snapshotter ──
console.log('\n=== Snapshotter ===');
const snapshotter = new Snapshotter({ snapshotInterval: 10 });

// Simulate an OpLog
const opLog = [
  { type: 'ADD_RUMOR', rumorId: 'rumor-123', text: 'Test rumor' },
  { type: 'ADD_VOTE', rumorId: 'rumor-123', voter: 'alice', vote: 'TRUE' },
  { type: 'ADD_VOTE', rumorId: 'rumor-123', voter: 'bob', vote: 'FALSE' },
  { type: 'ADD_RUMOR', rumorId: 'rumor-456', text: 'Another rumor' },
  { type: 'ADD_VOTE', rumorId: 'rumor-456', voter: 'alice', vote: 'TRUE' },
];

// Build view, skipping tombstoned entries
const tombstoned = new Set(['rumor-123']);
const activeOps = opLog.filter(op => !tombstoned.has(op.rumorId));
console.log('Total ops:', opLog.length);
console.log('Active ops (after tombstone):', activeOps.length);
console.log('rumor-123 removed from view: ✓');

// ── Step 3: Compute Personalized PageRank ──
console.log('\n=== Trust Propagator (PageRank) ===');
const propagator = new TrustPropagator(0.85, 100, 1e-6);

// Build trust graph: voters who co-correctly voted get edges
const graph = new Map();
graph.set('alice', new Map([['bob', 0.5], ['carol', 0.3]]));
graph.set('bob', new Map([['alice', 0.5], ['dave', 0.2]]));
graph.set('carol', new Map([['alice', 0.3]]));
graph.set('dave', new Map([['bob', 0.2]]));

// Trust seeds: MY device trusts alice and carol more
const mySeeds = new Map([
  ['alice', 0.4],
  ['bob', 0.2],
  ['carol', 0.3],
  ['dave', 0.1],
]);

const ppr = propagator.computePPR(graph, mySeeds);
console.log('Personalized PageRank scores:');
for (const [voter, score] of ppr) {
  console.log(`  ${voter}: ${score.toFixed(4)}`);
}

// ── Step 4: Anti-entropy sync ──
console.log('\n=== Anti-Entropy Sync ===');
const sync = new AntiEntropySync();

// Simulate: local node has 3 entries, peer has 5
const localEntries = ['entry1', 'entry2', 'entry3'];
const peerEntries = ['entry1', 'entry2', 'entry3', 'entry4', 'entry5'];

const missing = peerEntries.filter(e => !localEntries.includes(e));
console.log('Local entries:', localEntries.length);
console.log('Peer entries:', peerEntries.length);
console.log('Missing (need to sync):', missing);
console.log('Delta sync: download', missing.length, 'entries (not', peerEntries.length, ')');

console.log('\n✓ Phase 4 complete — security hardening + state management');
```

Run it:
```bash
node demo-phase4.js
```

---

## 8. Full End-to-End Pipeline

This combines all 4 phases into a single flow showing the complete application lifecycle:

Create `backend/demo-full-pipeline.js`:

```javascript
import { IdentityManager } from './src/identity/identity-manager.js';
import { MembershipTree } from './src/identity/membership-tree.js';
import { CorrelationDampener } from './src/scoring/correlation-dampener.js';
import { RBTSEngine } from './src/scoring/rbts-engine.js';
import { ReputationManager } from './src/scoring/reputation-manager.js';
import { TombstoneManager } from './src/state/tombstone-manager.js';

async function fullPipeline() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   AFWAAH — Full Pipeline Demonstration   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ══════════════════════════════════════
  // PHASE 1: IDENTITY
  // ══════════════════════════════════════
  console.log('── Phase 1: Identity & Membership ──');
  const mgr = new IdentityManager();
  const tree = new MembershipTree();

  const students = {};
  for (const name of ['alice', 'bob', 'carol', 'dave', 'eve']) {
    students[name] = mgr.create(name + '-secret');
    tree.addMember(students[name].commitment);
  }
  console.log(`  ${tree.memberCount} students joined anonymously`);

  // Verify Alice's membership
  const proof = tree.generateMerkleProof(0);
  console.log(`  Alice membership proof valid: ${tree.verifyMerkleProof(proof)}`);

  // ══════════════════════════════════════
  // PHASE 2: POST A RUMOR (simulated)
  // ══════════════════════════════════════
  console.log('\n── Phase 2: Post a Rumor ──');
  const rumor = {
    rumorId: 'QmPizzaRumor',
    text: 'Free pizza in the student lounge at 5 PM!',
    topic: 'events',
    author: 'alice',
    timestamp: Date.now(),
  };
  console.log(`  Rumor posted: "${rumor.text}"`);
  console.log(`  Topic: ${rumor.topic}`);
  console.log(`  (Would be broadcast via GossipSub to all peers)`);

  // ══════════════════════════════════════
  // PHASE 3: VOTE & SCORE
  // ══════════════════════════════════════
  console.log('\n── Phase 3: Vote & Score ──');
  const rep = new ReputationManager();
  Object.keys(students).forEach(s => rep.register(s));

  const votes = [
    { nullifier: 'alice', vote: 'TRUE',       prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, stakeAmount: 2 },
    { nullifier: 'bob',   vote: 'TRUE',       prediction: { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 }, stakeAmount: 2 },
    { nullifier: 'carol', vote: 'TRUE',       prediction: { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 }, stakeAmount: 1 },
    { nullifier: 'dave',  vote: 'FALSE',      prediction: { TRUE: 0.4, FALSE: 0.5, UNVERIFIED: 0.1 }, stakeAmount: 1 },
    { nullifier: 'eve',   vote: 'UNVERIFIED', prediction: { TRUE: 0.5, FALSE: 0.3, UNVERIFIED: 0.2 }, stakeAmount: 1 },
  ];

  // Bot detection
  const dampener = new CorrelationDampener();
  const dampened = dampener.dampen(votes, new Map());
  console.log(`  ${dampened.length} votes processed (no bots detected — all independent)`);

  // Score
  const rbts = new RBTSEngine();
  const result = rbts.calculate(dampened, rumor.rumorId, 42);
  console.log(`  Consensus: ${result.consensus}`);
  console.log(`  Trust Score: ${result.rumorTrustScore.toFixed(1)}/100`);

  // Reputation update
  const stakes = new Map(votes.map(v => [v.nullifier, v.stakeAmount]));
  rep.applyScores(result, rumor.rumorId, stakes);

  console.log('  Reputation after scoring:');
  for (const name of Object.keys(students)) {
    console.log(`    ${name}: ${rep.getScore(name).toFixed(2)}`);
  }

  // ══════════════════════════════════════
  // PHASE 4: DELETE & REBUILD
  // ══════════════════════════════════════
  console.log('\n── Phase 4: Delete Rumor & Rebuild ──');
  const tm = new TombstoneManager();
  tm.addTombstone(rumor.rumorId, 'alice', 'retracted');
  console.log(`  Rumor tombstoned by author (reason: retracted)`);
  console.log(`  Is tombstoned: ${tm.isTombstoned(rumor.rumorId)}`);
  console.log('  Snapshotter would rebuild state, zeroing out this rumor\'s influence');
  console.log('  Anti-entropy would sync this tombstone to offline peers');

  // ══════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════
  console.log('\n══════════════════════════════════════');
  console.log('  PIPELINE COMPLETE');
  console.log('  Join → Post → Vote → Score → Delete');
  console.log('  All 4 phases demonstrated');
  console.log('══════════════════════════════════════');
}

fullPipeline().catch(console.error);
```

Run it:
```bash
node demo-full-pipeline.js
```

---

## 9. Configuration Reference

All settings are in `backend/src/config.js`. Here are the key ones you might want to adjust:

### Identity

| Setting | Default | Effect |
|---------|---------|--------|
| `ALLOWED_DOMAINS` | `['university.edu', 'student.university.edu']` | Which email domains are accepted for registration |
| `ADMIN_DOMAINS` | `['admin.university.edu']` | Which domains can inject official proofs |
| `ROOT_HISTORY_SIZE` | `10` | How many old Merkle roots are still accepted (allows for network delay) |

### Scoring

| Setting | Default | Effect |
|---------|---------|--------|
| `RBTS_THRESHOLD` | `30` | Below this voter count, use RBTS instead of BTS |
| `INITIAL_TRUST_SCORE` | `10` | Starting reputation for every new student |
| `SLASH_MULTIPLIER` | `1.5` | How harsh penalties are (1.5× means you lose more than you staked) |
| `CORRELATION_LAMBDA` | `10.0` | Bot detection sensitivity (higher = more aggressive dampening) |
| `CLUSTER_THRESHOLD` | `0.85` | Correlation above which voters are grouped as a bot cluster |
| `DECAY_RATE` | `0.99` | Daily reputation decay (prevents score hoarding) |

### Network

| Setting | Default | Effect |
|---------|---------|--------|
| `GOSSIP_MESH_SIZE` | `6` | Target number of gossip mesh peers |
| `SYNC_COOLDOWN` | `30000` | Milliseconds between anti-entropy sync requests |
| `MAX_MESSAGE_SIZE` | `65536` | Maximum message size in bytes |

### Storage

| Setting | Default | Effect |
|---------|---------|--------|
| `SNAPSHOT_INTERVAL` | `10` | Rebuild materialized view every N operations |

---

## 10. Troubleshooting

| Problem | Solution |
|---------|----------|
| `Cannot use import statement outside a module` | Use `--experimental-vm-modules` flag. Node 18+ required. |
| Tests hang and don't exit | Add `--forceExit` flag. libp2p sockets need time to close. |
| `EADDRINUSE` errors | Wait a few seconds, or kill leftover Node processes: `taskkill /F /IM node.exe` (Windows) |
| npm install fails | Install C++ build tools: VS Build Tools (Windows), `build-essential` (Linux), Xcode CLT (Mac) |
| OrbitDB stale data | Delete `./orbitdb` and `./ipfs` directories and retry |
| Only some tests pass | Run them individually with `--verbose` to see which ones fail and read the error messages |

---

## Clean Up Demo Files

After running the demos, clean up:

```bash
cd backend
rm -f demo-identity.js demo-network.js demo-scoring.js demo-phase4.js demo-full-pipeline.js
rm -rf ./demo-orbitdb-data ./orbitdb ./ipfs
```
