# 🚀 Getting Started

This guide gets you from a fresh GitHub clone to a working dev environment.

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

You should see all tests passing across three test files:

```
 PASS  tests/identity.test.js     (32 tests)
 PASS  tests/network.test.js      (53 tests)
 PASS  tests/scoring.test.js      (46 tests)

Tests:  131 passed, 131 total
```

> **Note**: The `--experimental-vm-modules` flag is required because the project uses ES Modules (`"type": "module"` in package.json). The `--forceExit` ensures libp2p network tests clean up properly.

---

## Step 4 — Run Individual Test Suites

You can run each phase's tests separately:

```bash
# Phase 1: Identity & Membership
npm run test:identity

# Phase 2: P2P Network & Storage
npm run test:network

# Phase 3: Scoring Engine
npm run test:scoring
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
│   │   │   └── gossip-controller.js
│   │   ├── storage/              # Phase 2: Data Layer
│   │   │   ├── db.js
│   │   │   └── stores.js
│   │   └── scoring/              # Phase 3: Scoring Engine
│   │       ├── correlation-dampener.js
│   │       ├── bts-engine.js
│   │       ├── rbts-engine.js
│   │       └── reputation-manager.js
│   └── tests/
│       ├── identity.test.js
│       ├── network.test.js
│       └── scoring.test.js
├── docs/                         # Architecture & design docs
├── how-to-use/                   # These guides
└── frontend/                     # (Coming soon)
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

**Next**: [Phase 1 — Identity & Membership →](./02-IDENTITY-AND-MEMBERSHIP.md)
