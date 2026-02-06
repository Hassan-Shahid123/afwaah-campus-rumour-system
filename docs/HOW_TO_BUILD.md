# How To Build — Setup, Configuration & Testing

> Complete build instructions for the Afwaah backend infrastructure.

---

## Prerequisites

| Tool | Minimum Version | Check Command | Why It's Needed |
|------|-----------------|---------------|-----------------|
| **Node.js** | 18.0.0 | `node --version` | Runtime for all modules (ES Modules require v18+) |
| **npm** | 9.0.0 | `npm --version` | Package manager for dependencies |
| **Git** | any | `git --version` | Clone the repository |

> **Windows users**: Use PowerShell, Command Prompt, or Git Bash. All commands work cross-platform.

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/Hassan-Shahid123/afwaah-campus-rumour-system.git
cd afwaah-campus-rumour-system
```

---

## Step 2 — Install Dependencies

```bash
cd backend
npm install
```

This installs the full dependency tree:

| Package | What It Does |
|---------|-------------|
| `@semaphore-protocol/identity` | EdDSA-Poseidon keypair generation |
| `@semaphore-protocol/group` | Lean Incremental Merkle Tree (LeanIMT) |
| `@semaphore-protocol/proof` | ZK-SNARK proof generation & verification |
| `libp2p` | Modular P2P networking framework |
| `@chainsafe/libp2p-noise` | Noise protocol encryption for peer connections |
| `@chainsafe/libp2p-yamux` | Stream multiplexing over single connections |
| `@libp2p/gossipsub` | Gossip-based pub/sub for message propagation |
| `@libp2p/mdns` | Multicast DNS for local network peer discovery |
| `@libp2p/kad-dht` | Kademlia DHT for wide-area peer routing |
| `@helia/unixfs` | IPFS content-addressed storage |
| `@orbitdb/core` | Distributed CRDT database on IPFS |
| `circomlibjs` | ZK circuit utilities (Poseidon hash) |
| `snarkjs` | ZK-SNARK prover / verifier |
| `mailparser` | Email DKIM signature parsing |
| `jest` | Testing framework |

---

## Step 3 — Run All Tests

```bash
npx --node-options="--experimental-vm-modules" jest --verbose --forceExit
```

**Expected output:**

```
 PASS  tests/identity.test.js       (32 tests)
 PASS  tests/network.test.js        (53 tests)
 PASS  tests/scoring.test.js        (46 tests)
 PASS  tests/integration.test.js    (80 tests)

Tests:       211 passed, 211 total
Test Suites: 4 passed, 4 total
```

### Why the flags?

| Flag | Reason |
|------|--------|
| `--experimental-vm-modules` | Required for ES Modules (`"type": "module"` in package.json). Jest doesn't natively support ESM yet. |
| `--forceExit` | libp2p network tests keep sockets open briefly after teardown. This flag ensures the process exits cleanly. |
| `--verbose` | Shows individual test names (optional but recommended). |

---

## Step 4 — Run Individual Phase Tests

```bash
# Phase 1: Identity & Membership (32 tests)
npx --node-options="--experimental-vm-modules" jest tests/identity.test.js --verbose

# Phase 2: P2P Network & Storage (53 tests)
npx --node-options="--experimental-vm-modules" jest tests/network.test.js --verbose --forceExit

# Phase 3: Scoring Engine (46 tests)
npx --node-options="--experimental-vm-modules" jest tests/scoring.test.js --verbose

# Phase 4: Security & Integration (80 tests)
npx --node-options="--experimental-vm-modules" jest tests/integration.test.js --verbose --forceExit
```

Or use npm scripts (if defined in package.json):

```bash
npm run test:identity
npm run test:network
npm run test:scoring
```

---

## Configuration

All tunable parameters are centralized in `backend/src/config.js`. You can modify these before running.

### Identity Settings

```javascript
export const IDENTITY = {
  ALLOWED_DOMAINS: ['university.edu', 'student.university.edu'],
  ADMIN_DOMAINS: ['admin.university.edu'],
  ROOT_HISTORY_SIZE: 10,    // Accept last N Merkle roots for delayed proofs
};
```

**To use your own university domain**, add it to `ALLOWED_DOMAINS`:
```javascript
ALLOWED_DOMAINS: ['university.edu', 'student.university.edu', 'myuniversity.ac.uk'],
```

### Scoring Settings

```javascript
export const SCORING = {
  BTS_ALPHA: 1.0,              // Weight of prediction component (higher = predictions matter more)
  PREDICTION_FLOOR: 0.001,     // Prevents log(0) in BTS math
  RBTS_THRESHOLD: 30,          // Use RBTS for fewer than 30 voters
  INITIAL_TRUST_SCORE: 10,     // Starting reputation for new users
  MIN_STAKE_TO_VOTE: 1,        // Minimum reputation to lock for voting
  MIN_STAKE_TO_POST: 5,        // Minimum reputation to lock for posting
  SLASH_MULTIPLIER: 1.5,       // Penalty severity (1.5× stronger than rewards)
  REWARD_MULTIPLIER: 1.0,      // Reward scaling
  CORRELATION_LAMBDA: 10.0,    // Bot detection sensitivity (higher = stricter)
  CLUSTER_THRESHOLD: 0.85,     // Pearson ρ above which voters cluster as bots
  MIN_SCORE: 0,                // Floor for reputation
  MAX_SCORE: 1000,             // Ceiling for reputation
  DECAY_RATE: 0.99,            // Daily score decay (prevents hoarding)
  RECOVERY_RATE: 0.1,          // Score recovery for zeroed-out users
};
```

### Network Settings

```javascript
export const NETWORK = {
  GOSSIP_HEARTBEAT_INTERVAL: 1000,   // ms between gossip heartbeats
  GOSSIP_MESH_SIZE: 6,               // Target number of mesh peers
  SYNC_COOLDOWN: 30000,              // ms between anti-entropy sync requests
  MAX_MESSAGE_SIZE: 65536,           // Maximum message size in bytes
};
```

### Storage Settings

```javascript
export const STORAGE = {
  STORES: {
    RUMORS: 'afwaah.rumors',
    VOTES: 'afwaah.votes',
    IDENTITIES: 'afwaah.identities',
    REPUTATION: 'afwaah.reputation',
  },
  SNAPSHOT_INTERVAL: 10,    // Rebuild materialized view every N operations
};
```

---

## Project Structure

```
backend/
├── package.json                 # Dependencies & npm scripts
├── jest.config.js               # Jest configuration (ESM transform)
├── src/
│   ├── config.js                # All tunable constants (edit this!)
│   ├── identity/
│   │   ├── email-verifier.js    # DKIM email parsing & domain validation
│   │   ├── identity-manager.js  # Semaphore identity creation & management
│   │   └── membership-tree.js   # Merkle tree for group membership proofs
│   ├── network/
│   │   ├── node.js              # libp2p node (TCP, Noise, Yamux, GossipSub, mDNS, DHT)
│   │   ├── gossip-controller.js # Message validation, dedup, routing
│   │   └── anti-entropy.js      # Merkle diff sync for reconnecting nodes
│   ├── storage/
│   │   ├── db.js                # Helia (IPFS) + OrbitDB initialization
│   │   └── stores.js            # CRUD operations on 4 distributed stores
│   ├── scoring/
│   │   ├── bts-engine.js        # Bayesian Truth Serum (N ≥ 30)
│   │   ├── rbts-engine.js       # Robust BTS with peer-pairing (3 ≤ N < 30)
│   │   ├── correlation-dampener.js  # Bot cluster detection via Pearson ρ
│   │   ├── reputation-manager.js    # Staking, slashing, decay, recovery
│   │   └── trust-propagator.js      # Personalized PageRank
│   └── state/
│       ├── snapshotter.js       # OpLog traversal & materialized view rebuild
│       └── tombstone-manager.js # Logical deletion & ghost cleanup
└── tests/
    ├── identity.test.js         # 32 tests — identity, DKIM, Merkle
    ├── network.test.js          # 53 tests — libp2p, gossip, OrbitDB
    ├── scoring.test.js          # 46 tests — BTS, RBTS, correlation, reputation
    └── integration.test.js      # 80 tests — full pipeline, tombstones, snapshots, PageRank, anti-entropy
```

---

## Troubleshooting

### `ERR_REQUIRE_ESM` or `Cannot use import statement outside a module`

The project uses ES Modules (`"type": "module"` in package.json). Make sure:
- Node.js ≥ 18
- Use `--experimental-vm-modules` flag with Jest

### Tests hang or don't exit

Use `--forceExit` flag. libp2p nodes keep sockets open briefly after test teardown.

### `EADDRINUSE` errors

Previous test runs may have left ports open. Wait a few seconds and retry, or kill leftover Node processes:
```bash
# Windows
taskkill /F /IM node.exe

# Linux/Mac
killall node
```

### `npm install` fails on native modules

circomlibjs needs native compilation:
- **Windows**: Install "Desktop development with C++" from Visual Studio Build Tools
- **Linux**: `sudo apt install build-essential`
- **Mac**: `xcode-select --install`

### OrbitDB test data leftover

If tests fail due to stale data, clean up:
```bash
rm -rf ./orbitdb ./ipfs
```

---

## Adding to the Project

### Adding a new module

1. Create your file in the appropriate `src/` subdirectory
2. Use ES Module syntax (`export class`, `import ... from`)
3. Import constants from `config.js` as needed
4. Add tests in `tests/` following the existing Jest patterns

### Running in development

For quick iteration, run a single test file in watch mode:
```bash
npx --node-options="--experimental-vm-modules" jest tests/scoring.test.js --watch
```

---

## Further Reading

- **[WHAT_IS_AFWAAH.md](WHAT_IS_AFWAAH.md)** — What the project is
- **[HOW_IT_WORKS.md](HOW_IT_WORKS.md)** — Technical deep-dive into every module
- **[../how-to-use/](../how-to-use/)** — Step-by-step code examples for each phase
- **[../RUN_GUIDE.md](../RUN_GUIDE.md)** — Complete end-to-end running walkthrough
