# Afwaah — Project Structure & Module Guide

> **Version:** 1.0  
> **Purpose:** File-by-file specification of every module in the infrastructure

---

## 1. Complete File Tree

```
afwaah-campus-rumour-system/
│
├── .gitignore                      # Node modules, IPFS data, etc.
├── README.md                       # Project overview & quick start
│
├── docs/
│   ├── plan.txt                    # Original research document
│   ├── IMPLEMENTATION_PLAN.md      # 4-hour sprint breakdown
│   ├── ARCHITECTURE_DESIGN.md      # System architecture & data flows
│   ├── PROTOCOL_SPEC.md            # Wire protocol & message formats
│   ├── SCORING_ENGINE_SPEC.md      # BTS/RBTS math specification
│   └── PROJECT_STRUCTURE.md        # This file
│
├── frontend/                       # ⏳ GUI — NOT YET IMPLEMENTED
│   ├── README.md                   # Placeholder with planned scope
│   ├── public/                     # Static assets (later)
│   └── src/
│       ├── components/             # UI components (later)
│       ├── pages/                  # Page views (later)
│       ├── styles/                 # CSS / styling (later)
│       └── assets/                 # Images, icons (later)
│
└── backend/                        # Infrastructure & protocol layer
    ├── package.json                # Dependencies & scripts
    ├── jest.config.js              # Test configuration
    │
    ├── src/
    │   ├── index.js                # Bootstrap & orchestrator
    │   ├── config.js               # All constants & configuration
    │   │
    │   ├── identity/
    │   │   ├── email-verifier.js    # DKIM extraction & ZK-Email proof
    │   │   ├── identity-manager.js  # Semaphore identity (secret → commitment)
    │   │   └── membership-tree.js   # Merkle tree for anonymous membership
    │   │
    │   ├── network/
    │   │   ├── node.js              # libp2p node configuration & lifecycle
    │   │   ├── gossip-controller.js # Pub/sub message routing & validation
    │   │   └── anti-entropy.js      # Offline/online sync & read-repair
    │   │
    │   ├── storage/
    │   │   ├── db.js                # IPFS (Helia) + OrbitDB initialization
    │   │   └── stores.js            # Store definitions (rumors, votes, etc.)
    │   │
    │   ├── scoring/
    │   │   ├── bts-engine.js        # Bayesian Truth Serum (N ≥ 30)
    │   │   ├── rbts-engine.js       # Robust BTS (N ≥ 3)
    │   │   ├── reputation-manager.js # Staking, slashing, trust lifecycle
    │   │   ├── correlation-dampener.js # Bot cluster detection & weight reduction
    │   │   └── trust-propagator.js  # Personalized PageRank
    │   │
    │   └── state/
    │       ├── snapshotter.js       # Periodic OpLog re-traversal
    │       └── tombstone-manager.js # Logical deletion & ghost cleanup
    │
    └── tests/
        ├── identity.test.js        # Identity module unit tests
        ├── network.test.js         # P2P networking tests
        ├── scoring.test.js         # BTS/RBTS/reputation tests
        └── integration.test.js     # Full-flow end-to-end tests
```

---

## 2. Module Specifications

### 2.1 `backend/src/config.js` — Configuration Constants

All tunable parameters for the protocol, scoring, and networking in one place.

```javascript
// What it exports:
module.exports = {
  PROTOCOL,           // Gossipsub topics, version strings
  SCORING,            // BTS alpha, lambda, thresholds, stake amounts
  IDENTITY,           // Merkle tree depth, allowed domains
  NETWORK,            // Heartbeat intervals, mesh sizes, timeouts
  STORAGE,            // OrbitDB store names, snapshot intervals
};
```

**Depends on:** Nothing (leaf module)  
**Used by:** Every other module

---

### 2.2 `backend/src/identity/email-verifier.js` — DKIM Email Verification

Parses `.eml` files and generates ZK proofs that the email was signed by a university mail server.

```javascript
class EmailVerifier {
  /**
   * Parse a .eml file and extract the DKIM signature
   * @param {string|Buffer} emlContent - Raw email content
   * @returns {DKIMResult} - { domain, selector, signature, bodyHash, isValid }
   */
  async extractDKIM(emlContent) {}

  /**
   * Generate a ZK proof that this DKIM signature is valid
   * without revealing the email content or address
   * @param {DKIMResult} dkim
   * @returns {ZKProof} - { proof, publicSignals }
   */
  async generateProof(dkim) {}

  /**
   * Verify a ZK-Email proof (runs on receiving peers)
   * @param {ZKProof} proof
   * @returns {boolean}
   */
  async verifyProof(proof) {}
}
```

**Depends on:** `zk-email-sdk`, `config.js`  
**Used by:** `identity-manager.js`, `gossip-controller.js`

---

### 2.3 `backend/src/identity/identity-manager.js` — Semaphore Identity

Creates and manages the student's anonymous identity using the Semaphore protocol.

```javascript
class IdentityManager {
  /**
   * Create a new Semaphore identity from a secret
   * @param {string} secret - User-generated or derived from DKIM
   * @returns {SemaphoreIdentity} - { commitment, trapdoor, nullifier }
   */
  create(secret) {}

  /**
   * Generate a Semaphore proof for posting/voting
   * @param {SemaphoreIdentity} identity
   * @param {MerkleProof} merkleProof - From membership-tree
   * @param {string} externalNullifier - Scoped to the action
   * @param {string} signal - The message being signed
   * @returns {SemaphoreProof}
   */
  async generateProof(identity, merkleProof, externalNullifier, signal) {}

  /**
   * Verify a Semaphore proof (runs on receiving peers)
   * @param {SemaphoreProof} proof
   * @param {string} merkleRoot
   * @returns {boolean}
   */
  async verifyProof(proof, merkleRoot) {}

  /**
   * Persist identity to local encrypted storage
   * @param {SemaphoreIdentity} identity
   * @param {string} passphrase
   */
  async save(identity, passphrase) {}

  /**
   * Load identity from local encrypted storage
   * @param {string} passphrase
   * @returns {SemaphoreIdentity}
   */
  async load(passphrase) {}
}
```

**Depends on:** `@semaphore-protocol/identity`, `@semaphore-protocol/proof`, `circomlibjs`, `config.js`  
**Used by:** `gossip-controller.js`, `index.js`

---

### 2.4 `backend/src/identity/membership-tree.js` — Merkle Tree

Manages the incremental Merkle tree storing all identity commitments.

```javascript
class MembershipTree {
  /**
   * Initialize tree with given depth
   * @param {number} depth - Default: 20 (supports ~1M users)
   */
  constructor(depth = 20) {}

  /**
   * Add a new identity commitment to the tree
   * @param {BigInt} commitment
   * @returns {number} - The leaf index
   */
  add(commitment) {}

  /**
   * Generate a Merkle inclusion proof for a commitment
   * @param {number} leafIndex
   * @returns {MerkleProof} - { root, siblings, pathIndices }
   */
  generateProof(leafIndex) {}

  /**
   * Verify a Merkle proof
   * @param {MerkleProof} proof
   * @returns {boolean}
   */
  verifyProof(proof) {}

  /**
   * Get the current root hash
   * @returns {BigInt}
   */
  getRoot() {}

  /**
   * Get the last N roots (for delayed proof acceptance)
   * @param {number} n
   * @returns {BigInt[]}
   */
  getRootHistory(n = 10) {}

  /**
   * Sync tree state from OrbitDB identities store
   * @param {Array<BigInt>} commitments
   */
  async syncFromStore(commitments) {}
}
```

**Depends on:** `@semaphore-protocol/group`, `config.js`  
**Used by:** `identity-manager.js`, `gossip-controller.js`

---

### 2.5 `backend/src/network/node.js` — libp2p Node

Configures and manages the P2P network node.

```javascript
class AfwaahNode {
  /**
   * Create and start a libp2p node with full protocol stack
   * @param {Object} options - { listenAddresses, bootstrapPeers }
   * @returns {Libp2p}
   */
  async start(options) {}

  /**
   * Gracefully stop the node
   */
  async stop() {}

  /**
   * Get list of connected peers
   * @returns {PeerId[]}
   */
  getPeers() {}

  /**
   * Get node's multiaddresses for sharing
   * @returns {Multiaddr[]}
   */
  getAddresses() {}

  /**
   * Subscribe to a gossipsub topic
   * @param {string} topic
   * @param {Function} handler
   */
  subscribe(topic, handler) {}

  /**
   * Publish to a gossipsub topic
   * @param {string} topic
   * @param {Uint8Array} data
   */
  async publish(topic, data) {}
}
```

**Depends on:** `libp2p`, `@chainsafe/libp2p-noise`, `@chainsafe/libp2p-yamux`, `@libp2p/gossipsub`, `@libp2p/mdns`, `@libp2p/kad-dht`, `config.js`  
**Used by:** `gossip-controller.js`, `db.js`, `index.js`

---

### 2.6 `backend/src/network/gossip-controller.js` — Message Router

Routes incoming gossip messages through the validation pipeline and to the correct store.

```javascript
class GossipController {
  /**
   * @param {AfwaahNode} node
   * @param {StoreManager} stores
   * @param {IdentityManager} identityManager
   * @param {MembershipTree} membershipTree
   */
  constructor(node, stores, identityManager, membershipTree) {}

  /**
   * Start listening on all protocol topics
   */
  async startListening() {}

  /**
   * Handle incoming rumor: validate ZK proof → check nullifier → store
   * @param {RumorMessage} message
   * @returns {ValidationResult}
   */
  async handleRumor(message) {}

  /**
   * Handle incoming vote: validate → check nullifier → check stake → store
   * @param {VoteMessage} message
   * @returns {ValidationResult}
   */
  async handleVote(message) {}

  /**
   * Handle join: validate DKIM proof → add commitment to tree → store
   * @param {JoinMessage} message
   * @returns {ValidationResult}
   */
  async handleJoin(message) {}

  /**
   * Handle tombstone: validate authorship → add tombstone to log
   * @param {TombstoneMessage} message
   * @returns {ValidationResult}
   */
  async handleTombstone(message) {}

  /**
   * Broadcast a message to the network
   * @param {string} type - 'RUMOR' | 'VOTE' | 'JOIN' | 'TOMBSTONE'
   * @param {Object} payload
   */
  async broadcast(type, payload) {}
}
```

**Depends on:** `node.js`, `stores.js`, `identity-manager.js`, `membership-tree.js`, `config.js`  
**Used by:** `index.js`

---

### 2.7 `backend/src/network/anti-entropy.js` — Sync Engine

Handles state synchronization for nodes that go offline and come back.

```javascript
class AntiEntropySync {
  /**
   * @param {AfwaahNode} node
   * @param {StoreManager} stores
   * @param {MembershipTree} tree
   */
  constructor(node, stores, tree) {}

  /**
   * Perform full sync with a peer
   * @param {PeerId} peerId
   * @returns {SyncReport} - { rumorsAdded, votesAdded, identitiesAdded }
   */
  async syncWithPeer(peerId) {}

  /**
   * Compare local Merkle roots with peer and identify missing data
   * @param {PeerId} peerId
   * @returns {DiffResult}
   */
  async computeDiff(peerId) {}

  /**
   * Read-repair: fix stale local data during reads
   * @param {string} storeType
   * @param {string} key
   */
  async readRepair(storeType, key) {}

  /**
   * Start automatic background sync at interval
   * @param {number} intervalMs
   */
  startPeriodicSync(intervalMs = 30000) {}
}
```

**Depends on:** `node.js`, `stores.js`, `membership-tree.js`, `config.js`  
**Used by:** `index.js`

---

### 2.8 `backend/src/storage/db.js` — Database Initialization

Sets up IPFS (Helia) and OrbitDB.

```javascript
class DatabaseManager {
  /**
   * Initialize IPFS and OrbitDB
   * @param {Libp2p} libp2pNode - The running libp2p instance
   * @returns {OrbitDB}
   */
  async initialize(libp2pNode) {}

  /**
   * Gracefully close all connections
   */
  async close() {}

  /**
   * Get the underlying OrbitDB instance
   * @returns {OrbitDB}
   */
  getOrbitDB() {}

  /**
   * Get the underlying IPFS (Helia) instance
   * @returns {Helia}
   */
  getIPFS() {}
}
```

**Depends on:** `helia`, `@orbitdb/core`, `config.js`  
**Used by:** `stores.js`, `index.js`

---

### 2.9 `backend/src/storage/stores.js` — Store Manager

Creates and manages all OrbitDB stores.

```javascript
class StoreManager {
  /**
   * @param {OrbitDB} orbitdb
   */
  constructor(orbitdb) {}

  /**
   * Open all stores (rumors, votes, identities, reputation)
   */
  async openAll() {}

  /**
   * Append a rumor to the EventLog
   * @param {Object} rumorData
   * @returns {string} - CID of the entry
   */
  async addRumor(rumorData) {}

  /**
   * Append a vote to the EventLog
   * @param {Object} voteData
   * @returns {string} - CID of the entry
   */
  async addVote(voteData) {}

  /**
   * Register an identity commitment
   * @param {string} commitment
   * @param {Object} metadata
   */
  async addIdentity(commitment, metadata) {}

  /**
   * Update reputation score
   * @param {string} nullifierId
   * @param {Object} scoreData
   */
  async updateReputation(nullifierId, scoreData) {}

  /**
   * Query: Get all votes for a rumor
   * @param {string} rumorId
   * @returns {Vote[]}
   */
  async getVotesForRumor(rumorId) {}

  /**
   * Query: Get all non-tombstoned rumors
   * @returns {Rumor[]}
   */
  async getActiveRumors() {}

  /**
   * Query: Check if nullifier exists
   * @param {string} nullifier
   * @param {string} store - 'rumors' | 'votes'
   * @returns {boolean}
   */
  async nullifierExists(nullifier, store) {}

  /**
   * Close all stores
   */
  async closeAll() {}
}
```

**Depends on:** `@orbitdb/core`, `config.js`  
**Used by:** `gossip-controller.js`, `snapshotter.js`, `scoring modules`

---

### 2.10 `backend/src/scoring/bts-engine.js` — BTS Calculator

See [SCORING_ENGINE_SPEC.md](SCORING_ENGINE_SPEC.md) Section 3 for full math.

**Depends on:** `config.js`  
**Used by:** `index.js` (scoring pipeline)

---

### 2.11 `backend/src/scoring/rbts-engine.js` — Robust BTS Calculator

See [SCORING_ENGINE_SPEC.md](SCORING_ENGINE_SPEC.md) Section 4 for full math.

**Depends on:** `circomlibjs` (Poseidon for deterministic PRNG seed), `config.js`  
**Used by:** `index.js` (scoring pipeline)

---

### 2.12 `backend/src/scoring/reputation-manager.js` — Trust Score Manager

See [SCORING_ENGINE_SPEC.md](SCORING_ENGINE_SPEC.md) Section 5 for full specification.

**Depends on:** `stores.js`, `config.js`  
**Used by:** `gossip-controller.js` (stake validation), `index.js` (score application)

---

### 2.13 `backend/src/scoring/correlation-dampener.js` — Bot Detector

See [SCORING_ENGINE_SPEC.md](SCORING_ENGINE_SPEC.md) Section 2 for full algorithm.

**Depends on:** `stores.js` (vote history), `config.js`  
**Used by:** `index.js` (scoring pipeline, runs before BTS/RBTS)

---

### 2.14 `backend/src/scoring/trust-propagator.js` — Personalized PageRank

See [SCORING_ENGINE_SPEC.md](SCORING_ENGINE_SPEC.md) Section 6 for full algorithm.

**Depends on:** `stores.js`, `config.js`  
**Used by:** `index.js` (final trust calculation)

---

### 2.15 `backend/src/state/snapshotter.js` — View Rebuilder

Periodically re-traverses the entire OrbitDB operation log to rebuild the "materialized view" of truth scores, ensuring Ghost Dependencies are eliminated.

```javascript
class Snapshotter {
  /**
   * @param {StoreManager} stores
   * @param {ReputationManager} reputationManager
   * @param {number} interval - Rebuild every N operations
   */
  constructor(stores, reputationManager, interval = 10) {}

  /**
   * Walk the entire OpLog, skip tombstones, recalculate all scores
   * @returns {Snapshot} - { scores, activeRumors, timestamp, opCount }
   */
  async rebuild() {}

  /**
   * Get the latest snapshot
   * @returns {Snapshot}
   */
  getLatest() {}

  /**
   * Start auto-rebuild on operation count threshold
   */
  startWatching() {}

  /**
   * Manually trigger a full rebuild (e.g., after detecting corruption)
   */
  async forceRebuild() {}
}
```

**Depends on:** `stores.js`, `reputation-manager.js`, `tombstone-manager.js`, `config.js`  
**Used by:** `index.js`

---

### 2.16 `backend/src/state/tombstone-manager.js` — Deletion Handler

Manages logical deletions and ensures ghost reputation is cleaned up.

```javascript
class TombstoneManager {
  /**
   * @param {StoreManager} stores
   */
  constructor(stores) {}

  /**
   * Mark a rumor as tombstoned
   * @param {string} rumorId
   * @param {string} reason
   * @returns {string} - CID of tombstone entry
   */
  async tombstone(rumorId, reason) {}

  /**
   * Check if a rumor has been tombstoned
   * @param {string} rumorId
   * @returns {boolean}
   */
  async isTombstoned(rumorId) {}

  /**
   * Get all tombstoned rumor IDs
   * @returns {Set<string>}
   */
  async getTombstonedIds() {}

  /**
   * Filter an array of entries, removing tombstoned ones
   * @param {Array} entries
   * @returns {Array}
   */
  async filterActive(entries) {}
}
```

**Depends on:** `stores.js`, `config.js`  
**Used by:** `snapshotter.js`, `gossip-controller.js`

---

### 2.17 `backend/src/index.js` — Bootstrap Orchestrator

The entry point that wires everything together and starts the node.

```javascript
/**
 * Bootstrap sequence:
 *
 * 1. Load config
 * 2. Start libp2p node (AfwaahNode)
 * 3. Initialize IPFS + OrbitDB (DatabaseManager)
 * 4. Open all stores (StoreManager)
 * 5. Initialize MembershipTree (sync from store)
 * 6. Initialize IdentityManager
 * 7. Initialize scoring modules (BTS, RBTS, Reputation, Correlation, Trust)
 * 8. Initialize state modules (Snapshotter, TombstoneManager)
 * 9. Start GossipController (listen on all topics)
 * 10. Start AntiEntropySync (periodic background sync)
 * 11. Start Snapshotter (periodic view rebuild)
 * 12. Expose API for higher-level consumers (CLI, future UI)
 *
 * Shutdown sequence:
 * 1. Stop Snapshotter
 * 2. Stop AntiEntropySync
 * 3. Stop GossipController
 * 4. Close all OrbitDB stores
 * 5. Close OrbitDB + IPFS
 * 6. Stop libp2p node
 */

class AfwaahCore {
  async start() {}
  async stop() {}

  // Public API for consumers
  async join(emlContent) {}
  async postRumor(text, topic) {}
  async vote(rumorId, vote, prediction) {}
  async getRumors() {}
  async getRumorScore(rumorId) {}
  async getMyReputation() {}
  async deleteRumor(rumorId) {}
  async submitOfficialProof(emlContent, rumorId, impact) {}
}
```

**Depends on:** Everything  
**Used by:** CLI, future frontend, test harness

---

## 3. Dependency Graph

```
index.js
  ├── config.js
  ├── network/node.js
  │     └── config.js
  ├── storage/db.js
  │     └── config.js
  ├── storage/stores.js
  │     └── db.js, config.js
  ├── identity/email-verifier.js
  │     └── config.js
  ├── identity/identity-manager.js
  │     └── email-verifier.js, config.js
  ├── identity/membership-tree.js
  │     └── config.js
  ├── network/gossip-controller.js
  │     └── node.js, stores.js, identity-manager.js, membership-tree.js
  ├── network/anti-entropy.js
  │     └── node.js, stores.js, membership-tree.js
  ├── scoring/correlation-dampener.js
  │     └── stores.js, config.js
  ├── scoring/bts-engine.js
  │     └── config.js
  ├── scoring/rbts-engine.js
  │     └── config.js
  ├── scoring/reputation-manager.js
  │     └── stores.js, config.js
  ├── scoring/trust-propagator.js
  │     └── stores.js, config.js
  ├── state/snapshotter.js
  │     └── stores.js, reputation-manager.js, tombstone-manager.js
  └── state/tombstone-manager.js
        └── stores.js, config.js
```

---

## 4. npm Dependencies

```json
{
  "dependencies": {
    "libp2p": "latest",
    "@chainsafe/libp2p-noise": "latest",
    "@chainsafe/libp2p-yamux": "latest",
    "@libp2p/gossipsub": "latest",
    "@libp2p/mdns": "latest",
    "@libp2p/kad-dht": "latest",
    "@libp2p/tcp": "latest",
    "@libp2p/webrtc": "latest",
    "@libp2p/circuit-relay-v2": "latest",
    "@orbitdb/core": "latest",
    "helia": "latest",
    "@semaphore-protocol/identity": "^4",
    "@semaphore-protocol/group": "^4",
    "@semaphore-protocol/proof": "^4",
    "@zk-email/sdk": "latest",
    "circomlibjs": "latest",
    "snarkjs": "latest",
    "mailparser": "latest"
  },
  "devDependencies": {
    "jest": "latest",
    "nodemon": "latest"
  }
}
```

---

## 5. npm Scripts

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "npx --node-options=\"--experimental-vm-modules\" jest --verbose",
    "test:identity": "npx --node-options=\"--experimental-vm-modules\" jest tests/identity.test.js --verbose",
    "test:network": "npx --node-options=\"--experimental-vm-modules\" jest tests/network.test.js --verbose",
    "test:scoring": "npx --node-options=\"--experimental-vm-modules\" jest tests/scoring.test.js --verbose",
    "test:integration": "npx --node-options=\"--experimental-vm-modules\" jest tests/integration.test.js --verbose",
    "snapshot:rebuild": "node -e \"require('./src/state/snapshotter').forceRebuild()\""

    Note: All scripts run from within the backend/ directory (cd backend first).
  }
}
```
