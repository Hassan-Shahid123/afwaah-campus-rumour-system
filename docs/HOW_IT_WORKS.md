# How It Works — Technical Deep-Dive

> This document explains how every module in Afwaah works, how they connect, and how data flows through the system.

---

## 1. Architecture Overview

Afwaah has **5 module groups** organized in 4 build phases:

```
Phase 1: identity/          → Anonymous identity management
Phase 2: network/ + storage/ → Communication + persistence
Phase 3: scoring/           → Truth discovery + reputation
Phase 4: state/             → Consistency + security hardening
```

Every module is a standalone ES Module class. They compose together in a pipeline:

```
Student Action → ZK Proof → Gossip Broadcast → OrbitDB Storage → BTS Scoring → Reputation Update
```

---

## 2. Phase 1 — Identity & Membership

### How Anonymous Identity Works

The system uses **Semaphore Protocol V4** for zero-knowledge group membership. The core idea: prove "I am a verified student" without revealing "I am Student X."

**Step-by-step process:**

1. **Student downloads their university email** as a `.eml` file
2. **`EmailVerifier`** parses the DKIM signature from the email headers
   - DKIM is a cryptographic signature that mail servers attach to every outgoing email
   - If the signature verifies against the university domain (e.g., `@university.edu`), the student is legitimate
3. **`IdentityManager`** generates a Semaphore identity:
   - A secret key generates an **EdDSA-Poseidon commitment** (a one-way hash)
   - The commitment is public — it goes into the membership tree
   - The private key never leaves the device
4. **`MembershipTree`** adds the commitment as a leaf in a Merkle tree (using LeanIMT — Lean Incremental Merkle Tree)
   - Anyone can verify "this commitment is in the tree" via a Merkle proof
   - The proof reveals nothing about which leaf it is

**Key security property:** The nullifier (derived from the secret + a scope) prevents double-actions. For any rumor, a student's identity can only produce one unique nullifier — submitting a second vote with the same nullifier is rejected.

### Files

| File | Class | Purpose |
|------|-------|---------|
| `identity/email-verifier.js` | `EmailVerifier` | Parse `.eml`, extract DKIM, validate domain |
| `identity/identity-manager.js` | `IdentityManager` | Create/export/import Semaphore identities |
| `identity/membership-tree.js` | `MembershipTree` | Merkle tree: add, remove, proof, verify, root history |

---

## 3. Phase 2 — P2P Network & Storage

### How libp2p Networking Works

Every device runs a **libp2p node** — a modular networking stack that handles:

| Component | Technology | What It Does |
|-----------|-----------|--------------|
| **Transport** | TCP | Raw connections between devices |
| **Encryption** | Noise Protocol | All peer traffic is encrypted (no plaintext) |
| **Multiplexing** | Yamux | Multiple logical streams over one TCP connection |
| **Pub/Sub** | GossipSub | Broadcast messages to all peers via gossip mesh |
| **Discovery** | mDNS | Auto-discover peers on the same Wi-Fi / LAN |
| **Routing** | Kademlia DHT | Find peers across different networks (WAN) |
| **Identity** | Peer ID | Each node has a cryptographic identity (Ed25519 key) |

**GossipSub** is the core communication protocol. Messages are published to **topics** — all subscribers receive them:

| Topic | Purpose |
|-------|---------|
| `/afwaah/rumors/1.0` | New rumor submissions |
| `/afwaah/votes/1.0` | Votes on rumors |
| `/afwaah/identity/1.0` | New member joins |
| `/afwaah/tombstone/1.0` | Rumor deletions |
| `/afwaah/sync/1.0` | Anti-entropy sync requests |

**`GossipController`** sits between raw GossipSub and the application. It:
- Validates incoming message schemas
- Checks ZK proofs
- Deduplicates by nullifier (rejects double posts/votes)
- Routes valid messages to the correct OrbitDB store

### How OrbitDB Storage Works

**Helia** is a lightweight IPFS implementation. **OrbitDB** builds a distributed database on top of IPFS:

- Data is stored as content-addressed blocks (CIDs) on IPFS
- OrbitDB creates an **OpLog** — an append-only Merkle-DAG of operations
- When peers connect, their OpLogs merge automatically (CRDT — Conflict-free Replicated Data Type)
- No central database server — every device has a full local copy

**Four stores:**

| Store | Type | Key → Value | Purpose |
|-------|------|-------------|---------|
| `afwaah.rumors` | EventLog | auto (CID) → `{ text, zkProof, nullifier, timestamp, topic }` | Immutable rumor ledger |
| `afwaah.votes` | EventLog | auto (CID) → `{ rumorId, vote, prediction, nullifier, stake }` | BTS vote records |
| `afwaah.identities` | KVStore | commitment → `{ joinedAt, merkleIndex }` | Membership registry |
| `afwaah.reputation` | KVStore | nullifier → `{ score, history, lastUpdated }` | Trust scores |

### Files

| File | Class | Purpose |
|------|-------|---------|
| `network/node.js` | `AfwaahNode` | libp2p node lifecycle (start, stop, dial, peers) |
| `network/gossip-controller.js` | `GossipController` | Message validation, routing, deduplication |
| `storage/db.js` | `DatabaseManager` | Helia + OrbitDB initialization |
| `storage/stores.js` | `StoreManager` | CRUD operations on the 4 stores |

---

## 4. Phase 3 — Scoring Engine

### How Bayesian Truth Serum (BTS) Works

BTS is a game-theoretic scoring mechanism. The key insight: **truth-telling is the mathematically dominant strategy** — honest voters always earn more points than liars.

**The dual-question format:**

Every voter answers two questions for each rumor:
1. **"What do you think?"** — TRUE, FALSE, or UNVERIFIED (your personal vote)
2. **"What will others say?"** — A probability distribution predicting how everyone else will vote

**Why this works:**

Liars can fake their vote, but they can't accurately predict how others will vote about a topic they're lying about. The math exploits this gap:

- **Information Score**: $\text{InfoScore}_i = \log\frac{\bar{x}_k}{\bar{y}_k}$ — rewards "surprisingly common" answers (more frequent than predicted)
- **Prediction Score**: $\text{PredScore}_i = \alpha \sum_j \bar{x}_j \cdot \log\frac{P_j^i}{\bar{x}_j}$ — rewards accurate predictions

**BTS** runs when N ≥ 30 voters (needs statistical mass).  
**RBTS** (Robust BTS) runs for 3 ≤ N < 30 voters — uses peer-pairing instead of population statistics. A deterministic PRNG (Mulberry32, seeded by `rumorId + blockHeight`) ensures all nodes compute identical peer assignments.

### How Correlation Dampening Works

Detects **bot clusters** — groups of identities that vote identically across multiple rumors.

1. Build vote vectors for each voter across rumor history
2. Compute pairwise **Pearson correlation** ($\rho_{ij}$) between all voter pairs
3. Cluster voters where $\rho > 0.85$ using **Union-Find**
4. Apply weight: $W_G = \frac{1}{1 + \lambda \cdot \bar\rho(G)}$

**Effect:** 50 identical bots → effective weight of ~4.5 votes (instead of 50).

### How Reputation Works

Every student starts with a trust score of 10. Actions cost stake (reputation locked until scoring):

| Action | Minimum Stake | Maximum Stake |
|--------|--------------|---------------|
| Vote | 1 | 25% of score |
| Post rumor | 5 | 50% of score |

After BTS scoring:
- **Positive BTS score** → `reward = score × stake × 1.0` (reputation increases)
- **Negative BTS score** → `penalty = |score| × stake × 1.5` (reputation decreases — asymmetric risk)
- **Bot cluster detected** → `group penalty = base × (1 + log₂(clusterSize))`
- **Daily decay** → all scores × 0.99 (prevents hoarding)
- **Recovery** → zeroed-out users gain 0.1 per epoch (second chance)

### Files

| File | Class | Purpose |
|------|-------|---------|
| `scoring/correlation-dampener.js` | `CorrelationDampener` | Bot detection via pairwise Pearson correlation |
| `scoring/bts-engine.js` | `BTSEngine` | Standard BTS for N ≥ 30 |
| `scoring/rbts-engine.js` | `RBTSEngine` | Robust BTS for 3 ≤ N < 30 |
| `scoring/reputation-manager.js` | `ReputationManager` | Staking, slashing, decay, recovery, export/import |

---

## 5. Phase 4 — Security & State Management

### How Tombstone Deletion Works

In an append-only log, you can't delete entries. Instead, **tombstones** mark entries as logically deleted:

1. Only the **original author** can tombstone their rumor (verified cryptographically via nullifier match)
2. The tombstone is appended to the log (not modifying the original entry)
3. When scores are recalculated, tombstoned entries are **skipped** — their votes/reputation effects become zero
4. Prevents the **Ghost Dependency Bug** — where deleted rumors leave phantom trust scores

### How the Snapshotter Works

The snapshotter periodically rebuilds the **materialized view** (current state) from the immutable OpLog:

1. Every N operations (default: 10), the snapshotter runs
2. It **walks the entire OpLog** from beginning to end
3. Tombstoned entries are skipped
4. The current state (all scores, active rumors, vote tallies) is rebuilt from scratch
5. If the materialized view ever becomes corrupted, it can be discarded and rebuilt from the OpLog (single source of truth)

### How Trust Propagation Works

**Personalized PageRank (PPR)** gives each device a **subjective** trust ranking:

1. **Build a trust graph**: Nodes = voter identities, edges = co-correct voting interactions (weighted by BTS scores)
2. **Define trust seeds**: Each device chooses who to trust initially (personalization vector)
3. **Run PageRank**: Iterative computation until convergence (damping factor = 0.85)
4. **Result**: Each voter gets a PPR score — higher = more trusted by *this* device

**Subjective forks**: Two students with different trust seeds see different trust scores for the same rumor. This is intentional — the system respects epistemic sovereignty.

### How Anti-Entropy Sync Works

When a node goes offline and comes back, it needs to catch up on missed data:

1. **Merkle tree comparison**: The reconnecting node exchanges Merkle roots with peers
2. **Identify differences**: Compare tree branches to find exactly which entries are missing
3. **Delta sync**: Only transfer the missing entries (bandwidth-efficient)
4. **Read-repair**: If local state is stale, rebuild from the synced OpLog

### Files

| File | Class | Purpose |
|------|-------|---------|
| `state/snapshotter.js` | `Snapshotter` | OpLog traversal, materialized view rebuild |
| `state/tombstone-manager.js` | `TombstoneManager` | Logical deletion, author validation |
| `scoring/trust-propagator.js` | `TrustPropagator` | Personalized PageRank computation |
| `network/anti-entropy.js` | `AntiEntropySync` | Merkle diff, delta sync, read-repair |

---

## 6. Complete Data Flow

### Student Joins

```
.eml file → EmailVerifier (DKIM check) → IdentityManager (Semaphore ID)
  → MembershipTree (add commitment) → GossipSub broadcast (JOIN)
  → All peers update their local Merkle tree
```

### Rumor Posted

```
Student types rumor → Generate Merkle proof → Generate nullifier
  → Package { text, zkProof, nullifier, timestamp }
  → GossipSub publish → All peers verify proof → Append to rumors EventLog
```

### Vote Cast

```
Student votes + predicts → Check stake ≥ min → Generate vote nullifier
  → Package { rumorId, vote, prediction, stake, zkProof }
  → GossipSub publish → Peers verify & check no double-vote → Append to votes EventLog
```

### Scoring Runs

```
Fetch all votes for rumor → CorrelationDampener (bot detection)
  → Check population N → BTS (N≥30) or RBTS (3≤N<30)
  → ReputationManager (reward honest, slash liars)
  → TrustPropagator (update PageRank)
  → Store updated scores in reputation KVStore
```

### Rumor Deleted

```
Author creates tombstone → Verify author nullifier matches → Append tombstone to log
  → Snapshotter walks OpLog → Skips tombstoned entries → Rebuilds all scores
  → Ghost reputation eliminated
```

---

## 7. Configuration

All tunable parameters are in `backend/src/config.js`:

| Section | Key Constants |
|---------|---------------|
| **IDENTITY** | `ALLOWED_DOMAINS`, `ROOT_HISTORY_SIZE` (10) |
| **SCORING** | `BTS_ALPHA` (1.0), `RBTS_THRESHOLD` (30), `INITIAL_TRUST_SCORE` (10), `SLASH_MULTIPLIER` (1.5), `CORRELATION_LAMBDA` (10.0), `CLUSTER_THRESHOLD` (0.85) |
| **PROTOCOL** | Topic strings, message types, allowed rumor categories, vote values |
| **NETWORK** | Gossip mesh parameters, sync cooldown, max message size |
| **STORAGE** | Store names, snapshot interval (10 operations) |

---

## 8. Consistency Model

The system is **AP** (Available + Partition-Tolerant) from the CAP theorem, with **eventual consistency**:

| Scenario | Behavior |
|----------|----------|
| Node online | Real-time gossip sync, scores update immediately |
| Node offline | Local reads still work, writes queued |
| Node reconnects | Anti-entropy Merkle diff sync + read-repair |
| Score disagreement | Expected — each device has subjective trust seeds |
| Network partition | Both partitions continue independently |
| Partition heals | CRDT merge — no conflicts in append-only logs |

---

## 9. Security

| Threat | Mitigation |
|--------|------------|
| Sybil Attack (fake identities) | ZK-Email: 1 university email = 1 identity |
| Double Voting | Nullifier hash collision detection |
| Coordinated Lying (botnets) | Correlation dampening reduces effective weight |
| Traffic Analysis | Noise encryption + ZK proofs hide identity |
| Admin Takeover | Personalized PageRank + subjective forks |
| Ghost Reputation | OpLog re-traversal + tombstones |
| Eclipse Attack | Kademlia DHT + multiple discovery mechanisms |
| Data Corruption | Rebuild materialized view from immutable OpLog |

---

## Further Reading

- **[ARCHITECTURE_DESIGN.md](ARCHITECTURE_DESIGN.md)** — Detailed architecture diagrams
- **[PROTOCOL_SPEC.md](PROTOCOL_SPEC.md)** — Wire protocol, message schemas, error codes
- **[SCORING_ENGINE_SPEC.md](SCORING_ENGINE_SPEC.md)** — Full mathematical specification
- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** — File-by-file module API reference
