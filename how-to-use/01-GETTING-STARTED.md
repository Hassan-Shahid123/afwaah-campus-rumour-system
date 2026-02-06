# Getting Started

This guide gets you from a fresh GitHub clone to a working dev environment. It also explains what technologies the project uses and why.

---

## What Technologies Are We Using?

Before diving in, here's what the project is built with and why each tool exists:

| Technology | What It Is | Why We Use It |
|-----------|-----------|---------------|
| **Node.js (≥18)** | JavaScript runtime that runs outside the browser | Runs all our backend modules. v18+ needed for ES Modules support. |
| **npm** | Node Package Manager | Installs all our dependencies from `package.json` |
| **ES Modules** | Modern JavaScript import/export syntax (`import`/`export`) | Cleaner code organization. Set via `"type": "module"` in package.json. |
| **Jest** | JavaScript testing framework | Runs all 211 tests. Needs `--experimental-vm-modules` flag for ESM. |
| **Semaphore V4** | Zero-knowledge proof protocol | Creates anonymous identities that prove group membership without revealing identity |
| **libp2p** | Modular peer-to-peer networking library | Handles device-to-device communication — no server needed |
| **OrbitDB** | Distributed database built on IPFS | Stores rumors, votes, identities across all peers |
| **Helia** | Lightweight IPFS implementation | Provides the content-addressed storage layer for OrbitDB |

---

## Prerequisites

| Tool | Minimum Version | Check Command |
|------|-----------------|---------------|
| **Node.js** | 18.0.0 | `node --version` |
| **npm** | 9.0.0 | `npm --version` |
| **Git** | any | `git --version` |

> **Windows users**: Use PowerShell, Command Prompt, or Git Bash. All commands work on any OS.

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

This installs all required packages:
- **Semaphore Protocol** — Zero-knowledge identity & group proofs
- **libp2p** — Peer-to-peer networking (TCP, Noise, GossipSub, mDNS, KadDHT)
- **Helia + OrbitDB** — Decentralized IPFS-based database
- **circomlibjs + snarkjs** — ZK circuit utilities
- **mailparser** — DKIM email parsing
- **Jest** — Testing framework

---

## Step 3 — Verify Installation

Run the full test suite:

```bash
npx --node-options="--experimental-vm-modules" jest --verbose --forceExit
```

You should see all tests passing across four test files:

```
 PASS  tests/identity.test.js       (32 tests)
 PASS  tests/network.test.js        (53 tests)
 PASS  tests/scoring.test.js        (46 tests)
 PASS  tests/integration.test.js    (80 tests)

Tests:       211 passed, 211 total
Test Suites: 4 passed, 4 total
```

> **Note**: The `--experimental-vm-modules` flag is required because the project uses ES Modules (`"type": "module"` in package.json). The `--forceExit` ensures libp2p network tests clean up properly.

---

## Step 4 — Run Individual Test Suites

You can run each phase's tests separately:

```bash
# Phase 1: Identity & Membership (32 tests)
npm run test:identity

# Phase 2: P2P Network & Storage (53 tests)
npm run test:network

# Phase 3: Scoring Engine (46 tests)
npm run test:scoring

# Phase 4: Security & Integration (80 tests)
npx --node-options="--experimental-vm-modules" jest tests/integration.test.js --verbose --forceExit
```

---

## Project Structure

```
afwaah-campus-rumour-system/
├── backend/
│   ├── package.json              # Project manifest (ES modules)
│   ├── src/
│   │   ├── config.js             # All configuration constants
│   │   ├── identity/             # Phase 1: ZK Identity
│   │   │   ├── email-verifier.js
│   │   │   ├── identity-manager.js
│   │   │   └── membership-tree.js
│   │   ├── network/              # Phase 2: P2P Network
│   │   │   ├── node.js
│   │   │   ├── gossip-controller.js
│   │   │   └── anti-entropy.js
│   │   ├── storage/              # Phase 2: Data Layer
│   │   │   ├── db.js
│   │   │   └── stores.js
│   │   ├── scoring/              # Phase 3: Scoring Engine
│   │   │   ├── bts-engine.js
│   │   │   ├── rbts-engine.js
│   │   │   ├── correlation-dampener.js
│   │   │   ├── reputation-manager.js
│   │   │   └── trust-propagator.js
│   │   └── state/                # Phase 4: State Management
│   │       ├── snapshotter.js
│   │       └── tombstone-manager.js
│   └── tests/
│       ├── identity.test.js      # 32 tests
│       ├── network.test.js       # 53 tests
│       ├── scoring.test.js       # 46 tests
│       └── integration.test.js   # 80 tests
├── docs/                         # Architecture & design docs
├── how-to-use/                   # These guides
└── frontend/                     # (Placeholder — GUI built separately)
```

---

## Troubleshooting

### `ERR_REQUIRE_ESM` or `SyntaxError: Cannot use import statement outside a module`
Make sure you're using Node.js ≥ 18 and the `--experimental-vm-modules` flag for Jest.

### Tests hang on network tests
Use `--forceExit` flag. libp2p nodes sometimes keep sockets open briefly after test teardown.

### `EADDRINUSE` errors
Previous test runs may have left ports open. Wait a few seconds and retry, or kill leftover Node processes.

### `npm install` fails on native modules
circomlibjs needs native compilation. On Windows, ensure you have the "Desktop development with C++" workload from Visual Studio Build Tools. On Linux: `sudo apt install build-essential`.

---

---

## What Each Phase Built

| Phase | Focus | What Was Built | Tests |
|-------|-------|----------------|-------|
| **1** | Identity & Membership | Email verification, anonymous ZK identities, Merkle group proofs | 32 |
| **2** | P2P Network & Storage | libp2p nodes, GossipSub messaging, OrbitDB distributed storage | 53 |
| **3** | Scoring Engine | BTS/RBTS truth scoring, bot detection, reputation staking/slashing | 46 |
| **4** | Security & State | Tombstone deletion, OpLog snapshots, PageRank trust, anti-entropy sync | 80 |
| | | **Total** | **211** |

---

**Next**: [Phase 1 — Identity & Membership →](./02-IDENTITY-AND-MEMBERSHIP.md)
