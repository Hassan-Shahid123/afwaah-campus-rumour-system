# Afwaah — Getting Started Guide

> **For teammates joining the project.** Read this first.
> Last updated: February 2026

---

## What You're Looking At

This is the backend infrastructure for **Afwaah** — a decentralized, anonymous campus rumor verification system. There is no server. Every student's device runs the full stack. You're going to help build the **frontend GUI** on top of this.

The backend is **done** and tested. Your job is to make it usable by humans.

---

## 1. Setting Up Your Machine

### Install Node.js

You need **Node.js 18 or newer**.

```bash
# Check if you have it
node --version
# Should print v18.x.x or higher
```

If not installed: [https://nodejs.org/](https://nodejs.org/) — download the LTS version.

### Clone the Repo

```bash
git clone https://github.com/Hassan-Shahid123/afwaah-campus-rumour-system.git
cd afwaah-campus-rumour-system
```

### Install Backend Dependencies

```bash
cd backend
npm install
```

This will take 1-2 minutes. It installs ~970 packages including:
- `libp2p` — peer-to-peer networking
- `@orbitdb/core` — decentralized database
- `helia` — IPFS implementation
- `@semaphore-protocol/*` — zero-knowledge identity proofs
- `jest` — test runner

### Verify Everything Works

```bash
npx --node-options="--experimental-vm-modules" jest --verbose --forceExit
```

You should see **85+ tests passing** across 3 test files. If tests fail, check:
- Node version (must be ≥18)
- Are you in the `backend/` directory?
- Did `npm install` complete without errors?

---

## 2. Understanding the Architecture

### The Big Picture

```
Student Device
├── Frontend (React — YOUR JOB)
│   ├── Join page         → calls Identity module
│   ├── Feed page         → reads from Storage, listens to Gossip
│   ├── Post rumor page   → calls Gossip + ZK proof
│   ├── Vote page         → calls Scoring + Gossip
│   └── Profile page      → reads Reputation
│
└── Backend (Node.js — DONE)
    ├── Identity Module    → ZK-Email verify → Semaphore anonymous ID
    ├── Network Module     → libp2p gossipsub → encrypted P2P
    ├── Storage Module     → OrbitDB → serverless replicated DB
    └── Scoring Module     → BTS truth scoring → reputation system
```

### How Data Flows

1. Student writes a rumor in the frontend
2. Frontend calls `IdentityManager` to generate a ZK proof (proves "I'm a member" without revealing who)
3. Frontend calls `GossipController.publishRumor()` to broadcast it
4. All peers receive it via gossipsub, validate the ZK proof, and write to their local OrbitDB
5. Other students vote (TRUE/FALSE/UNVERIFIED + prediction)
6. Scoring engine runs BTS math locally on every device
7. Truth scores converge across the network

---

## 3. What Each Module Does

### Identity (`backend/src/identity/`)

**Purpose:** Prove you're a student without revealing your name.

| File | What It Does |
|------|-------------|
| `email-verifier.js` | Parses `.eml` files, extracts DKIM signatures, validates `@university.edu` domain |
| `identity-manager.js` | Creates anonymous Semaphore V4 identities (EdDSA keypair → Poseidon hash → commitment) |
| `membership-tree.js` | Merkle tree of all identity commitments — proves membership without revealing which leaf |

**Key concept:** A student's *commitment* is a one-way hash. You can prove you're *in* the tree without saying *which* leaf is yours.

### Network (`backend/src/network/`)

**Purpose:** Encrypted P2P communication + message propagation.

| File | What It Does |
|------|-------------|
| `node.js` | Creates a libp2p node with TCP, Noise encryption, Yamux muxing, mDNS discovery, KadDHT |
| `gossip-controller.js` | Validates incoming messages (schema, nullifier dedup, topic rules), publishes outgoing messages |

**Gossip Topics:**
- `/afwaah/rumors/1.0` — new rumor broadcasts
- `/afwaah/votes/1.0` — vote broadcasts  
- `/afwaah/identity/1.0` — new member announcements
- `/afwaah/tombstone/1.0` — rumor deletion notices
- `/afwaah/sync/1.0` — state synchronization

### Storage (`backend/src/storage/`)

**Purpose:** Serverless database replicated across all peers.

| File | What It Does |
|------|-------------|
| `db.js` | Manages Helia (IPFS) + OrbitDB lifecycle |
| `stores.js` | Four CRDT stores: `rumors` (event log), `votes` (event log), `identities` (key-value), `reputation` (key-value) |

**Key concept:** OrbitDB is a *conflict-free* database. Every peer has a full copy. When peers sync, data merges automatically with no conflicts.

### Scoring (`backend/src/scoring/`)

**Purpose:** Truth discovery via game theory.

| File | What It Does |
|------|-------------|
| `bts-engine.js` | Bayesian Truth Serum — scores voters and rumors (for N ≥ 30 voters) |
| `rbts-engine.js` | Robust BTS — peer-pairing variant for small groups (3 ≤ N < 30) |
| `reputation-manager.js` | Trust scores, staking, slashing, decay/recovery |
| `correlation-dampener.js` | Detects bot clusters via Pearson correlation, dampens their vote weight |

**Key concept:** BTS asks two questions: "What do you believe?" and "What do you think others believe?" It's mathematically proven that your best strategy is to answer both honestly.

### Config (`backend/src/config.js`)

All tunable parameters in one file. Important ones:

```javascript
IDENTITY.ALLOWED_DOMAINS    // Which email domains are accepted
SCORING.BTS_ALPHA           // Weight of prediction component (1.0)
SCORING.INITIAL_TRUST_SCORE // New user starts with 10 reputation
SCORING.CORRELATION_LAMBDA  // Bot detection sensitivity (10.0)
PROTOCOL.TOPICS             // Gossipsub topic strings
```

---

## 4. Running Individual Tests

```bash
cd backend

# Identity module (32 tests)
npx --node-options="--experimental-vm-modules" jest tests/identity.test.js --verbose

# Network + Storage (53 tests)
npx --node-options="--experimental-vm-modules" jest tests/network.test.js --verbose --forceExit

# Scoring engine
npx --node-options="--experimental-vm-modules" jest tests/scoring.test.js --verbose
```

---

## 5. Key Files to Read First

If you're short on time, read these in order:

1. **`docs/ARCHITECTURE_DESIGN.md`** — system diagrams, module layout
2. **`docs/PROTOCOL_SPEC.md`** — message formats (you'll need these for the frontend)
3. **`docs/FRONTEND_GUIDE.md`** — step-by-step frontend development guide
4. **`backend/src/config.js`** — all the constants
5. **`backend/tests/`** — see how every module is used (tests are living documentation)

---

## 6. Common Questions

**Q: Why `--experimental-vm-modules`?**
A: The project uses ES modules (`import/export`). Jest needs this flag for ESM support.

**Q: Why `--forceExit` on network tests?**
A: libp2p opens background connections that Jest can't automatically close. `--forceExit` is safe — all assertions complete before exit.

**Q: Where's the server?**
A: There isn't one. Every device is a peer. Data syncs via IPFS gossip. That's the whole point.

**Q: Can I run two nodes locally to test gossip?**
A: Yes! Start two Node.js processes with different ports:
```javascript
import { AfwaahNode } from './src/network/node.js';
const node1 = new AfwaahNode();
const node2 = new AfwaahNode();
await node1.start();
await node2.start();
// They'll discover each other via mDNS on the same LAN
```

**Q: How do I add a new university domain?**
A: Edit `IDENTITY.ALLOWED_DOMAINS` in `backend/src/config.js`.

---

## 7. Git Workflow

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Make changes, commit often
git add -A
git commit -m "feat: description of what you did"

# Push your branch
git push origin feature/your-feature-name

# Open a Pull Request on GitHub
```

**Branch naming:**
- `feature/...` — new features
- `fix/...` — bug fixes
- `docs/...` — documentation changes

---

## Next Steps

1. Read `docs/FRONTEND_GUIDE.md` for the frontend development plan
2. Pick a page to build (Join, Feed, Post, Vote, or Profile)
3. Wire it up to the backend modules
4. Ask questions in the group chat!
