# Afwaah — 4-Hour Infrastructure Implementation Plan

> **Project:** Decentralized Campus Rumor Verification System  
> **Scope:** Backend infrastructure only (no frontend/UI)  
> **Budget:** $0 (open-source stack)  
> **Team Size:** Solo / Small team  
> **Date:** February 2026

---

## Executive Summary

Build the serverless backbone for a peer-to-peer campus rumor system that provides:
- Anonymous identity verification via ZK-Email + Semaphore
- Decentralized data storage via OrbitDB over IPFS
- Real-time gossip propagation via libp2p
- Truth scoring via Bayesian Truth Serum (BTS)
- Sybil resistance via correlation dampening

This plan covers **infrastructure only** — the protocol layer, networking, identity, storage, and scoring engine. No UI work.

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Node.js | ≥ 18 LTS | JavaScript runtime for all modules |
| P2P Networking | js-libp2p | latest | Peer discovery, gossip, NAT traversal |
| Pub/Sub | gossipsub | via libp2p | Real-time rumor propagation |
| Database | OrbitDB | v1.x | Serverless CRDT-based distributed DB |
| Storage | IPFS (Helia) | latest | Content-addressed immutable storage |
| ZK Identity | @semaphore-protocol | v4 | Anonymous group membership proofs |
| Email Verification | zk-email-sdk | latest | DKIM signature verification in ZK |
| Cryptography | circomlibjs / snarkjs | latest | ZK-SNARK proof generation & verification |
| Hashing | poseidon | via circomlib | ZK-friendly hash for identity commitments |
| Transport Security | @chainsafe/libp2p-noise | latest | Encrypted peer connections |
| Stream Muxing | @chainsafe/libp2p-yamux | latest | Multiplexed streams over single connection |
| Peer Discovery | @libp2p/mdns + @libp2p/kad-dht | latest | LAN + WAN peer discovery |

---

## Phase Breakdown (4 Hours)

### Phase 1: Identity & Membership Module (60 min)

**Objective:** Build the "gatekeeper" — verify students via ZK-Email and register them in the Semaphore anonymity set.

| # | Task | Time | Output |
|---|------|------|--------|
| 1.1 | Initialize Node.js project, install all dependencies | 10 min | `package.json` with all deps |
| 1.2 | Build `EmailVerifier` module — parse `.eml` files, extract DKIM signatures | 15 min | `backend/src/identity/email-verifier.js` |
| 1.3 | Build `IdentityManager` module — generate Semaphore identity (secret → commitment via Poseidon hash) | 15 min | `backend/src/identity/identity-manager.js` |
| 1.4 | Build `MembershipTree` module — maintain Merkle tree of identity commitments | 10 min | `backend/src/identity/membership-tree.js` |
| 1.5 | Integration test: `.eml` → DKIM verify → Semaphore ID → tree insertion | 10 min | `backend/tests/identity.test.js` |

**Deliverables:**
- `EmailVerifier` class with `verify(emlFilePath) → { domain, isValid, dkimProof }`
- `IdentityManager` class with `create(secret) → { commitment, nullifier, trapdoor }`
- `MembershipTree` class with `add(commitment)`, `generateProof(commitment)`, `verifyProof(proof)`

---

### Phase 2: P2P Network & Data Layer (60 min)

**Objective:** Stand up the libp2p node with gossipsub and OrbitDB for serverless rumor storage.

| # | Task | Time | Output |
|---|------|------|--------|
| 2.1 | Configure libp2p node (noise + yamux + gossipsub + mdns + kad-dht) | 15 min | `backend/src/network/node.js` |
| 2.2 | Define gossipsub topics: `/afwaah/rumors/1.0`, `/afwaah/votes/1.0`, `/afwaah/identity/1.0` | 5 min | Topic constants |
| 2.3 | Initialize IPFS (Helia) + OrbitDB instance | 10 min | `backend/src/storage/db.js` |
| 2.4 | Create OrbitDB stores: `rumors` (eventlog), `votes` (eventlog), `identities` (kvstore), `reputation` (kvstore) | 15 min | `backend/src/storage/stores.js` |
| 2.5 | Build `GossipController` — listen/publish on topics, pipe to OrbitDB | 10 min | `backend/src/network/gossip-controller.js` |
| 2.6 | Test: Two local nodes discover each other, gossip a message, both write to local OrbitDB | 5 min | `backend/tests/network.test.js` |

**Deliverables:**
- Functional libp2p node with encrypted channels
- OrbitDB stores for rumors, votes, identities, reputation
- Gossip layer that bridges pub/sub messages to database writes

---

### Phase 3: Scoring Engine & Verification Logic (60 min)

**Objective:** Implement the Bayesian Truth Serum scoring, reputation staking, and correlation dampening.

| # | Task | Time | Output |
|---|------|------|--------|
| 3.1 | Build `BTSEngine` — implement the BTS formula: information score + prediction score | 20 min | `backend/src/scoring/bts-engine.js` |
| 3.2 | Build `RBTSEngine` — implement Robust BTS for small populations (N ≥ 3) with peer-pairing | 10 min | `backend/src/scoring/rbts-engine.js` |
| 3.3 | Build `ReputationManager` — trust scores, staking, slashing logic | 15 min | `backend/src/scoring/reputation-manager.js` |
| 3.4 | Build `CorrelationDampener` — detect coordinated voting, apply weight reduction | 10 min | `backend/src/scoring/correlation-dampener.js` |
| 3.5 | Unit tests for BTS scoring with known inputs | 5 min | `backend/tests/scoring.test.js` |

**Key Formulas to Implement:**

**BTS Score:**
```
S_i = log(x̄_k / ȳ_k) + α * Σ_j x̄_j * log(P_j^i / x̄_j)
```

**Correlation Dampening Weight:**
```
W_G = 1 / (1 + λ * ρ(G))
```

**Deliverables:**
- BTS + RBTS scoring engines
- Reputation manager with stake/slash/decay
- Correlation dampener for bot detection

---

### Phase 4: Security Hardening & State Management (60 min)

**Objective:** Fix Ghost Dependency bug, implement tombstone deletions, build the Snapshotter, finalize the protocol.

| # | Task | Time | Output |
|---|------|------|--------|
| 4.1 | Build `Snapshotter` — traverses OrbitDB DAG, rebuilds materialized view every N operations | 15 min | `backend/src/state/snapshotter.js` |
| 4.2 | Implement tombstone deletion logic in the OpLog | 10 min | `backend/src/state/tombstone-manager.js` |
| 4.3 | Build `TrustPropagator` — Personalized PageRank with configurable trust seeds | 15 min | `backend/src/scoring/trust-propagator.js` |
| 4.4 | Build `AntiEntropySync` — read-repair + Merkle tree diff for reconnecting nodes | 10 min | `backend/src/network/anti-entropy.js` |
| 4.5 | Integration test: Full flow (join → post → vote → score → delete → rescore) | 10 min | `backend/tests/integration.test.js` |

**Deliverables:**
- Snapshotter that rebuilds scores from immutable OpLog
- Tombstone manager ensuring deleted rumors have zero influence
- Trust propagator with subjective epistemic forks
- Anti-entropy sync for offline/online transitions

---

## Post-Sprint Verification Checklist

| # | Verification | Pass Criteria |
|---|-------------|---------------|
| 1 | Identity: `.eml` → ZK proof → Semaphore commitment | Commitment added to Merkle tree |
| 2 | Networking: Two nodes discover each other on LAN | Peers listed in libp2p peer store |
| 3 | Gossip: Rumor posted on Node A appears on Node B | OrbitDB eventlog synced |
| 4 | Anonymity: Rumor cannot be linked to poster | ZK proof verifies, no identity leak |
| 5 | Double-vote: Same user voting twice is rejected | Nullifier collision detected |
| 6 | BTS: Known test vectors produce expected scores | Scores match hand-calculated values |
| 7 | Correlation: 50 identical votes → weight of 1 | Dampened weight ≈ single user |
| 8 | Tombstone: Deleted rumor zeroes out ghost reputation | Re-traversal shows updated scores |
| 9 | Sync: Offline node reconnects and gets latest state | Merkle diff sync completes |
| 10 | Encryption: All peer traffic is noise-encrypted | Wireshark shows no plaintext |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| ZK proof generation too slow (>40s) | Blocks user onboarding | Pre-compute circuits at build time; use wasm-optimized snarkjs |
| OrbitDB v1 breaking changes | Blocks storage layer | Pin exact version in package.json; use lockfile |
| libp2p NAT traversal fails on campus Wi-Fi | Nodes can't discover peers | Fall back to relay nodes (circuit-relay-v2) |
| Small population breaks BTS math | Scores unreliable | Switch to RBTS for N < 30 |
| DKIM key rotation by university | Email verification fails | Cache known DKIM public keys; allow manual key fetch |

---

## File Structure (Final)

```
afwaah-campus-rumour-system/
├── README.md
├── docs/
│   ├── IMPLEMENTATION_PLAN.md      ← You are here
│   ├── ARCHITECTURE_DESIGN.md      ← System architecture
│   ├── PROTOCOL_SPEC.md            ← Wire protocol & message formats
│   ├── SCORING_ENGINE_SPEC.md      ← BTS/RBTS math specification
│   └── PROJECT_STRUCTURE.md        ← Module-by-module guide
├── frontend/                       ← ⏳ GUI (placeholder — built later)
│   ├── README.md
│   ├── public/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── styles/
│       └── assets/
└── backend/
    ├── package.json
    ├── jest.config.js
    ├── src/
    │   ├── index.js                ← Entry point / bootstrap
    │   ├── config.js               ← Network & protocol constants
    │   ├── identity/
    │   │   ├── email-verifier.js
    │   │   ├── identity-manager.js
    │   │   └── membership-tree.js
    │   ├── network/
    │   │   ├── node.js
    │   │   ├── gossip-controller.js
    │   │   └── anti-entropy.js
    │   ├── storage/
    │   │   ├── db.js
    │   │   └── stores.js
    │   ├── scoring/
    │   │   ├── bts-engine.js
    │   │   ├── rbts-engine.js
    │   │   ├── reputation-manager.js
    │   │   ├── correlation-dampener.js
    │   │   └── trust-propagator.js
    │   └── state/
    │       ├── snapshotter.js
    │       └── tombstone-manager.js
    └── tests/
        ├── identity.test.js
        ├── network.test.js
        ├── scoring.test.js
        └── integration.test.js
```
