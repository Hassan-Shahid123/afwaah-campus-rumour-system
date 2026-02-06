# What Is Afwaah?

> **Afwaah** (Urdu: افواہ — "rumor") is a decentralized campus rumor verification system.

---

## The Problem

Campus rumors spread fast — "Dean cancelling Friday classes," "free pizza in the lounge," "exam postponed." Students share unverified claims through WhatsApp groups, social media, and word of mouth. There's no reliable way to:

1. **Verify** whether a rumor is true or false
2. **Stay anonymous** while sharing or voting on campus news
3. **Resist manipulation** from bots, coordinated liars, or authority figures

Traditional solutions (official portals, moderated forums) require a central authority — which introduces censorship, surveillance, and single points of failure.

---

## The Solution

Afwaah is a **serverless, peer-to-peer** infrastructure where:

- **Every student's device is both a client and a server** — no central backend
- **Identity is anonymous** — zero-knowledge proofs prove you're a verified student without revealing who you are
- **Truth emerges from math** — Bayesian Truth Serum (BTS) makes honesty the game-theoretically optimal strategy
- **Bots are neutralized** — correlation dampening detects coordinated voting patterns and reduces their influence
- **Data is censorship-resistant** — everything is stored on a distributed IPFS-based database (OrbitDB) replicated across all peers

---

## Design Principles

| Principle | What It Means |
|-----------|---------------|
| **Zero Trust** | No single entity (including the university) controls truth |
| **Privacy by Design** | Identity is never revealed; only group membership is proven |
| **Eventual Consistency** | Truth scores converge as more peers sync data |
| **Sybil Resistance** | One university email = one anonymous identity (enforced cryptographically) |
| **Incentive Compatibility** | Honesty is the dominant strategy — lying is mathematically punished |
| **Subjective Sovereignty** | Each device can compute its own trust rankings via personalized PageRank |

---

## What It Is NOT

- **Not a social media app** — It's infrastructure (backend protocol layer). A frontend/GUI is built separately on top.
- **Not blockchain** — No mining, no gas fees, no tokens. Reputation is an internal scoring mechanism only.
- **Not centralized** — There is no server, no database admin, no content moderator.
- **Not just a messaging app** — The BTS scoring mechanism is the core differentiator. Messages are scored for truth.

---

## System at a Glance

```
┌─────────────────────────────────────────────────────────┐
│                    STUDENT DEVICE                        │
│                                                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ ZK Identity │ │   Scoring    │ │ State Manager    │ │
│  │             │ │   Engine     │ │                  │ │
│  │ Email DKIM  │ │ BTS / RBTS   │ │ Snapshotter      │ │
│  │ Semaphore   │ │ Reputation   │ │ Tombstones       │ │
│  │ Merkle Tree │ │ Correlation  │ │ Anti-Entropy     │ │
│  │             │ │ PageRank     │ │                  │ │
│  └──────┬──────┘ └──────┬───────┘ └────────┬─────────┘ │
│         └───────────────┼──────────────────┘           │
│                         │                               │
│  ┌──────────────────────┴────────────────────────────┐ │
│  │          OrbitDB / IPFS (Helia)                    │ │
│  │    Rumors · Votes · Identities · Reputation       │ │
│  └──────────────────────┬────────────────────────────┘ │
│                         │                               │
│  ┌──────────────────────┴────────────────────────────┐ │
│  │          libp2p Network Layer                     │ │
│  │    TCP · Noise · Yamux · GossipSub · mDNS · DHT  │ │
│  └──────────────────────┬────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────┘
                          │
           ───────────────┼───────────────
           Campus Wi-Fi / Cellular Network
           ───────────────┼───────────────
                          │
┌─────────────────────────┼───────────────────────────────┐
│            OTHER STUDENT DEVICES (identical)             │
└─────────────────────────────────────────────────────────┘
```

---

## The Four Build Phases

The backend was built in 4 phases, each with its own test suite:

| Phase | Focus | Modules Built | Tests |
|-------|-------|---------------|-------|
| **1. Identity & Membership** | Anonymous ZK identity from university email | `email-verifier`, `identity-manager`, `membership-tree` | 32 |
| **2. P2P Network & Storage** | Decentralized communication and persistence | `node`, `gossip-controller`, `db`, `stores` | 53 |
| **3. Scoring Engine** | Truth discovery via game theory | `bts-engine`, `rbts-engine`, `correlation-dampener`, `reputation-manager` | 46 |
| **4. Security & State** | Hardening, consistency, trust propagation | `snapshotter`, `tombstone-manager`, `trust-propagator`, `anti-entropy` | 80 |
| | | **Total** | **211** |

---

## Who Uses This?

- **Students** — Share and verify campus rumors anonymously
- **Developers** — Build frontend applications on top of this protocol layer
- **Researchers** — Study decentralized information markets and game-theoretic truth mechanisms

---

## Where to Go Next

- **[HOW_IT_WORKS.md](HOW_IT_WORKS.md)** — Deep technical explanation of every module
- **[HOW_TO_BUILD.md](HOW_TO_BUILD.md)** — Set up, configure, and build the project
- **[../how-to-use/](../how-to-use/)** — Step-by-step guides with code examples for each phase
- **[../RUN_GUIDE.md](../RUN_GUIDE.md)** — Complete end-to-end running process
