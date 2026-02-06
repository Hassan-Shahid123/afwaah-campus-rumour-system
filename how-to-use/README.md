# How-To-Use Guides — Afwaah Campus Rumor System

Welcome! These guides are written for **teammates who want to understand how the project was built**, what technologies were used, and how to run and configure each phase.

Each guide explains:
- **What tools/technologies are used** and why we chose them
- **How to run the tests** for that phase
- **What you can configure** and how
- **Code examples** you can try yourself

---

## Guides

| # | Guide | What It Covers | Technologies |
|---|-------|----------------|-------------|
| 1 | [Getting Started](./01-GETTING-STARTED.md) | Clone, install, verify everything works | Node.js, npm, Jest |
| 2 | [Phase 1 — Identity & Membership](./02-IDENTITY-AND-MEMBERSHIP.md) | ZK identities, email verification, Merkle trees | Semaphore V4, EdDSA-Poseidon, DKIM, LeanIMT |
| 3 | [Phase 2 — P2P Network & Storage](./03-P2P-NETWORK-AND-STORAGE.md) | P2P nodes, gossip messaging, distributed storage | libp2p, GossipSub, Noise, Helia, OrbitDB |
| 4 | [Phase 3 — Scoring Engine](./04-SCORING-ENGINE.md) | Truth scoring, bot detection, reputation | BTS, RBTS, Pearson correlation, staking |
| 5 | [Phase 4 — Security & State](./05-SECURITY-AND-STATE.md) | Tombstones, snapshots, trust propagation, sync | OpLog, PageRank, Merkle diff, anti-entropy |

---

## Quick Reference

```bash
# Run ALL 211 tests
cd backend
npx --node-options="--experimental-vm-modules" jest --verbose --forceExit

# Run one phase at a time
npx --node-options="--experimental-vm-modules" jest tests/identity.test.js --verbose           # 32 tests
npx --node-options="--experimental-vm-modules" jest tests/network.test.js --verbose --forceExit # 53 tests
npx --node-options="--experimental-vm-modules" jest tests/scoring.test.js --verbose             # 46 tests
npx --node-options="--experimental-vm-modules" jest tests/integration.test.js --verbose --forceExit # 80 tests
```

Start with **[Getting Started](./01-GETTING-STARTED.md)** — it takes about 2 minutes.
