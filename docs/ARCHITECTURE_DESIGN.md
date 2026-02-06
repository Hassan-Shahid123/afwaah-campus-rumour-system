# Afwaah — Architecture Design Document

> **Version:** 1.0  
> **System:** Decentralized Campus Rumor Verification Infrastructure  
> **Scope:** Backend / Protocol Layer Only

---

## 1. System Overview

Afwaah is a serverless, peer-to-peer infrastructure for anonymous campus news dissemination with built-in truth verification. Every student's device acts as both a client and a server — there is no central authority.

### Design Principles

1. **Zero Trust Architecture** — No single entity (including the university) can control truth
2. **Privacy by Design** — Identity is never revealed; only membership is proven
3. **Eventual Consistency** — Truth scores converge as more peers sync
4. **Sybil Resistance** — One university email = one anonymous identity
5. **Incentive Compatibility** — Honesty is the dominant strategy via game theory

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        STUDENT DEVICE                           │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  ZK-Identity  │  │  Scoring     │  │  State Manager     │    │
│  │  Module       │  │  Engine      │  │                    │    │
│  │              │  │              │  │  ┌──────────────┐  │    │
│  │  EmailVerify  │  │  BTS/RBTS    │  │  │ Snapshotter  │  │    │
│  │  Semaphore    │  │  Reputation  │  │  │ Tombstones   │  │    │
│  │  Merkle Tree  │  │  Correlation │  │  │ OpLog Walker │  │    │
│  │              │  │  PageRank    │  │  └──────────────┘  │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘    │
│         │                 │                    │                │
│  ┌──────┴─────────────────┴────────────────────┴───────────┐   │
│  │                    OrbitDB / IPFS (Helia)                │   │
│  │                                                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │   │
│  │  │ Rumors  │ │  Votes  │ │Identities│ │ Reputation │  │   │
│  │  │EventLog │ │EventLog │ │ KVStore  │ │  KVStore   │  │   │
│  │  └─────────┘ └─────────┘ └──────────┘ └────────────┘  │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
│  ┌─────────────────────┴───────────────────────────────────┐   │
│  │                    libp2p Network Layer                  │   │
│  │                                                         │   │
│  │  Transport: TCP / WebRTC                                │   │
│  │  Security:  Noise Protocol (encrypted)                  │   │
│  │  Muxing:    Yamux (multiplexed streams)                 │   │
│  │  PubSub:    Gossipsub (rumor propagation)               │   │
│  │  Discovery: mDNS (LAN) + Kademlia DHT (WAN)            │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                        │
└────────────────────────┼────────────────────────────────────────┘
                         │
          ───────────────┼───────────────
          Campus Wi-Fi / Cellular Network
          ───────────────┼───────────────
                         │
┌────────────────────────┼────────────────────────────────────────┐
│               OTHER STUDENT DEVICES (PEERS)                     │
│                    (identical architecture)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Architecture

### 3.1 Identity Module

Responsible for proving "I am a verified student" without revealing "I am Student X."

```
┌─────────────────────────────────────────────────┐
│                Identity Module                   │
│                                                  │
│  .eml File ──► EmailVerifier ──► DKIM Proof     │
│                                     │            │
│                                     ▼            │
│               Secret Key ──► IdentityManager     │
│                                     │            │
│                              ┌──────┴──────┐     │
│                              │  Poseidon   │     │
│                              │   Hash      │     │
│                              └──────┬──────┘     │
│                                     │            │
│                                     ▼            │
│                              Identity Commitment │
│                                     │            │
│                                     ▼            │
│                             MembershipTree       │
│                            (Merkle Tree Add)     │
└─────────────────────────────────────────────────┘
```

**Data Flow:**
1. Student downloads `.eml` from university inbox
2. `EmailVerifier` extracts & validates DKIM signature against `@university.edu`
3. `IdentityManager` generates: `secret` → `Poseidon(secret)` → `commitment`
4. `commitment` is inserted into the global `MembershipTree` (Semaphore Merkle tree)
5. The secret never leaves the device

**Key Invariants:**
- One DKIM signature → One identity commitment (enforced by nullifier derivation from DKIM)
- Commitment is a one-way hash — cannot be reversed to reveal the email
- Merkle tree root is replicated across all peers via OrbitDB

---

### 3.2 Network Module

Handles peer discovery, encrypted communication, and message propagation.

```
┌───────────────────────────────────────────────────────┐
│                  Network Module                        │
│                                                        │
│  ┌────────────┐    ┌──────────────────────────────┐   │
│  │  libp2p    │    │       Gossipsub Topics        │   │
│  │  Node      │◄──►│                              │   │
│  │            │    │  /afwaah/rumors/1.0           │   │
│  │  - Noise   │    │  /afwaah/votes/1.0           │   │
│  │  - Yamux   │    │  /afwaah/identity/1.0        │   │
│  │  - mDNS    │    │  /afwaah/tombstone/1.0       │   │
│  │  - DHT     │    │  /afwaah/sync/1.0            │   │
│  └────────────┘    └──────────────────────────────┘   │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │            GossipController                     │   │
│  │                                                 │   │
│  │  on('rumor')  → validate ZK proof → OrbitDB    │   │
│  │  on('vote')   → validate nullifier → OrbitDB   │   │
│  │  on('join')   → validate commitment → tree     │   │
│  │  on('delete') → add tombstone → OpLog          │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │            AntiEntropySync                      │   │
│  │                                                 │   │
│  │  - Merkle tree diff on reconnect               │   │
│  │  - Read-repair for stale local state           │   │
│  │  - Bandwidth-efficient delta sync              │   │
│  └────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

**Peer Discovery Strategy:**
- **Same Wi-Fi (LAN):** mDNS broadcasts — instant discovery
- **Different buildings (WAN):** Kademlia DHT — finds peers via distributed routing table
- **Fallback:** Circuit Relay v2 — relay through a reachable peer when behind strict NAT

---

### 3.3 Storage Module

OrbitDB provides a serverless, eventually consistent database replicated across all peers.

```
┌──────────────────────────────────────────────────────┐
│                  Storage Module                       │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │                  IPFS (Helia)                    │ │
│  │          Content-Addressed Storage               │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         │                             │
│  ┌──────────────────────┴──────────────────────────┐ │
│  │                   OrbitDB                        │ │
│  │                                                  │ │
│  │  ┌────────────────┐  ┌────────────────┐         │ │
│  │  │ rumors         │  │ votes          │         │ │
│  │  │ (EventLog)     │  │ (EventLog)     │         │ │
│  │  │                │  │                │         │ │
│  │  │ Append-only    │  │ Append-only    │         │ │
│  │  │ Merkle-DAG     │  │ Merkle-DAG     │         │ │
│  │  └────────────────┘  └────────────────┘         │ │
│  │                                                  │ │
│  │  ┌────────────────┐  ┌────────────────┐         │ │
│  │  │ identities     │  │ reputation     │         │ │
│  │  │ (KVStore)      │  │ (KVStore)      │         │ │
│  │  │                │  │                │         │ │
│  │  │ commitment →   │  │ nullifier →    │         │ │
│  │  │   metadata     │  │   trust score  │         │ │
│  │  └────────────────┘  └────────────────┘         │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Store Specifications:**

| Store | Type | Key | Value | Purpose |
|-------|------|-----|-------|---------|
| `rumors` | EventLog | auto (CID) | `{ text, zkProof, nullifier, timestamp, topic }` | Immutable rumor ledger |
| `votes` | EventLog | auto (CID) | `{ rumorId, vote, prediction, zkProof, nullifier, stake }` | BTS vote records |
| `identities` | KVStore | commitment hash | `{ joinedAt, merkleIndex }` | Membership registry |
| `reputation` | KVStore | nullifier-derived ID | `{ score, history[], lastUpdated }` | Trust scores |

**Conflict Resolution:**
- EventLogs: Append-only, no conflicts possible
- KVStores: Last-Write-Wins (LWW) with Lamport timestamps
- Cross-store consistency: Guaranteed by Merkle-DAG causal ordering

---

### 3.4 Scoring Module

The "brain" that runs on every device to independently calculate truth scores.

```
┌──────────────────────────────────────────────────────────┐
│                    Scoring Module                         │
│                                                           │
│  ┌──────────────┐                                        │
│  │  Incoming     │                                        │
│  │  Votes        │                                        │
│  └──────┬───────┘                                        │
│         │                                                 │
│         ▼                                                 │
│  ┌──────────────────┐     ┌─────────────────────────┐    │
│  │ Correlation      │────►│  Filter: Dampened Votes  │    │
│  │ Dampener         │     └────────────┬────────────┘    │
│  │                  │                  │                  │
│  │ ρ(G) → W_G      │                  ▼                  │
│  └──────────────────┘     ┌─────────────────────────┐    │
│                           │  Population Check        │    │
│                           │  N ≥ 30? → BTS           │    │
│                           │  N < 30? → RBTS          │    │
│                           └────────────┬────────────┘    │
│                                        │                  │
│                    ┌───────────────────┤                  │
│                    ▼                   ▼                  │
│  ┌──────────────────┐   ┌──────────────────┐            │
│  │    BTS Engine     │   │   RBTS Engine    │            │
│  │                   │   │                  │            │
│  │  S_i = log(x̄/ȳ)  │   │  Peer-pairing   │            │
│  │  + α·Σ prediction │   │  Reference agent │            │
│  └────────┬──────────┘   └────────┬─────────┘            │
│           │                       │                       │
│           └───────────┬───────────┘                       │
│                       ▼                                   │
│           ┌───────────────────────┐                       │
│           │  Reputation Manager   │                       │
│           │                       │                       │
│           │  Update trust scores  │                       │
│           │  Apply slashing       │                       │
│           │  Stake validation     │                       │
│           └───────────┬───────────┘                       │
│                       │                                   │
│                       ▼                                   │
│           ┌───────────────────────┐                       │
│           │  Trust Propagator     │                       │
│           │  (Personalized PPR)   │                       │
│           │                       │                       │
│           │  Local trust seeds    │                       │
│           │  Subjective forks     │                       │
│           └───────────────────────┘                       │
└──────────────────────────────────────────────────────────┘
```

---

### 3.5 State Management Module

Ensures consistency across the distributed system and resolves the Ghost Dependency bug.

```
┌──────────────────────────────────────────────────────┐
│                State Management                       │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Immutable OpLog                     │ │
│  │         (Source of Ground Truth)                  │ │
│  │                                                  │ │
│  │  op1 → op2 → op3 → [tombstone] → op4 → ...     │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                               │
│                       ▼                               │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Snapshotter                         │ │
│  │                                                  │ │
│  │  Every N operations:                             │ │
│  │  1. Walk entire OpLog                            │ │
│  │  2. Skip tombstoned entries                      │ │
│  │  3. Rebuild materialized view                    │ │
│  │  4. Recalculate all reputation scores            │ │
│  │  5. Emit new snapshot CID                        │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                               │
│                       ▼                               │
│  ┌─────────────────────────────────────────────────┐ │
│  │          Materialized View (Cache)               │ │
│  │                                                  │ │
│  │  Current trust scores, active rumors,            │ │
│  │  vote tallies — computed from OpLog              │ │
│  │                                                  │ │
│  │  If corrupted → discard → rebuild from OpLog    │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## 4. Data Flow: Complete Lifecycle

### 4.1 Student Joins the Network

```
Student                    Device                     P2P Network
   │                         │                            │
   │  Upload .eml file       │                            │
   │────────────────────────►│                            │
   │                         │  Extract DKIM              │
   │                         │  Generate ZK proof         │
   │                         │  Create Semaphore ID       │
   │                         │  (commitment, nullifier,   │
   │                         │   trapdoor)                │
   │                         │                            │
   │                         │  Broadcast commitment      │
   │                         │───────────────────────────►│
   │                         │                            │  All peers add to
   │                         │                            │  local Merkle tree
   │  ✓ Anonymous join       │                            │
   │◄────────────────────────│                            │
```

### 4.2 Posting a Rumor

```
Student                    Device                     P2P Network
   │                         │                            │
   │  "Dean cancelling       │                            │
   │   Friday classes"       │                            │
   │────────────────────────►│                            │
   │                         │  Generate Merkle proof     │
   │                         │  (proves membership)       │
   │                         │                            │
   │                         │  Generate nullifier        │
   │                         │  (secret ⊕ rumorId)       │
   │                         │                            │
   │                         │  Package:                  │
   │                         │  { text, zkProof,          │
   │                         │    nullifier, timestamp }  │
   │                         │                            │
   │                         │  Gossipsub publish         │
   │                         │───────────────────────────►│
   │                         │                            │  Peers verify proof
   │                         │                            │  Append to EventLog
   │  ✓ Rumor posted         │                            │
   │◄────────────────────────│                            │
```

### 4.3 Voting (BTS Dual-Question)

```
Student                    Device                     P2P Network
   │                         │                            │
   │  Vote: "True"           │                            │
   │  Predict: "60% True"    │                            │
   │────────────────────────►│                            │
   │                         │  Check: stake ≥ minimum    │
   │                         │  Generate vote nullifier   │
   │                         │  (prevents double-vote)    │
   │                         │                            │
   │                         │  Package:                  │
   │                         │  { rumorId, vote: TRUE,    │
   │                         │    prediction: 0.60,       │
   │                         │    zkProof, nullifier,     │
   │                         │    stakeAmount }           │
   │                         │                            │
   │                         │  Gossipsub publish         │
   │                         │───────────────────────────►│
   │                         │                            │  Peers verify
   │                         │                            │  Check nullifier
   │                         │                            │  Append to votes log
```

### 4.4 Score Calculation (Local)

```
Device (runs independently on every phone)
   │
   │  1. Fetch all votes for rumor R from OrbitDB
   │  2. Run CorrelationDampener → filter bot clusters
   │  3. Count population N
   │  4. If N ≥ 30: run BTS
   │     If N < 30: run RBTS
   │  5. Calculate information scores for all voters
   │  6. Update ReputationManager (reward/slash)
   │  7. Run TrustPropagator (Personalized PageRank)
   │  8. Store updated scores in reputation KVStore
   │
   │  Result: Trust Score for rumor R (local to this device)
```

---

## 5. Security Architecture

### 5.1 Threat Model

| Threat | Vector | Mitigation |
|--------|--------|------------|
| Sybil Attack | Create many fake identities | ZK-Email: 1 university email = 1 identity |
| Double Voting | Vote multiple times on same rumor | Nullifier hash collision detection |
| Coordinated Lying | Botnet floods "True" votes | Correlation dampening ($W_G$) |
| Traffic Analysis | Monitor Wi-Fi to identify posters | Noise encryption + ZK proofs |
| Admin Takeover | University manipulates truth | Personalized PageRank + subjective forks |
| Ghost Reputation | Deleted rumors leave phantom trust | OpLog re-traversal + tombstones |
| Eclipse Attack | Isolate a node from honest peers | Kademlia DHT + multiple discovery mechanisms |

### 5.2 Encryption Stack

```
Application Data (Rumor/Vote)
         │
         ▼
    ZK-SNARK Proof (privacy layer — hides identity)
         │
         ▼
    Gossipsub Message (protocol layer — topic routing)
         │
         ▼
    Noise Protocol (transport layer — encrypted channel)
         │
         ▼
    TCP / WebRTC (physical layer)
```

---

## 6. Consistency Model

The system operates under **AP** (Availability + Partition Tolerance) from the CAP theorem, with **eventual consistency**.

| Scenario | Behavior |
|----------|----------|
| Node online | Real-time gossip sync, scores update immediately |
| Node offline | Local reads still work, writes queued |
| Node reconnects | Anti-entropy Merkle diff sync, read-repair |
| Score disagreement | Expected — each device has subjective trust seeds |
| Network partition | Both partitions continue operating independently |
| Partition heals | CRDT merge — no conflicts in append-only logs |

---

## 7. Performance Targets (MVP)

| Metric | Target | Rationale |
|--------|--------|-----------|
| Peer discovery (LAN) | < 5 seconds | mDNS is fast on local subnet |
| Rumor propagation | < 2 seconds | Gossipsub fanout to all connected peers |
| ZK proof generation | < 60 seconds | Browser WASM; will improve with native plugins |
| BTS score calculation | < 500 ms | Pure math on local data |
| OrbitDB sync (100 entries) | < 10 seconds | Merkle diff minimizes bandwidth |
| Storage per 1000 rumors | < 50 MB | JSON + IPFS content addressing |
