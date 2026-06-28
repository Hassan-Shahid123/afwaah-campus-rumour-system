# Afwaah — آفواہ

> **A decentralized, anonymous campus rumor verification system.**  
> No server. No admin. No identity leakage. Just math deciding what's true.

Afwaah (Urdu for *rumor*) is a peer-to-peer infrastructure where students post and verify campus rumors anonymously. Every device is a node. Truth is determined not by who shouts loudest, but by **Bayesian game theory** — a mechanism where lying is mathematically unprofitable.

Built for the NUST Olympiad Hackathon.

---

## How It Works

![System Workflow](images/workflow.png)

Students verify their university identity once using a `.eml` file from their inbox. A **zero-knowledge proof** is generated — proving they're a real student without revealing *who* they are. From that point on, every vote and post is anonymous but accountable.

Rumors are scored not by popularity, but by **Bayesian Truth Serum** — an information-theoretic mechanism where informed minorities can outweigh uninformed majorities. Bot clusters are detected and neutralized. Deleted rumors leave no trace.

---

## Screenshots

### Home Page
![Home Page](images/home-page.png)

### Signup — ZK Email Verification
![Signup with ZK Email](images/signup.png)

### Login with Secure Anonymous Key
![Login](images/login-with-secure-key.png)

### Dashboard & Post a Rumor
![Dashboard](images/dashboard.png)

### Vote on a Rumor
![Voting](images/vote-on-rumor.png)

### Rumor Scoring, Votes & Reputation
![Scoring](images/scoring-votes-reputation.png)

### My Reputation & Community Leaderboard
![Reputation Leaderboard](images/reputation-leaderboard.png)

### Distributed Network — Peers Discovered
![Distributed Network](images/distributed-network-peers.png)

---

## The Problem It Solves

Campus information travels fast and is often wrong. Existing solutions either require a central authority to decide what's true (a single point of failure and censorship), or they let popularity win (mobs can spread false narratives). Afwaah solves both.

| Challenge | Solution |
|---|---|
| Anonymous posting without identity leakage | Semaphore ZK proofs + nullifier hashes |
| No central truth authority | BTS scoring — math decides, not admins |
| Preventing double votes without collecting identities | Poseidon nullifiers: deterministic per (identity, rumor) pair |
| Popular lies winning | BTS rewards *surprisingly common* answers, not *majority* answers |
| Bot accounts flooding votes | Pearson correlation clustering — bots in lockstep lose 91% of their weight |
| Deleted rumors haunting scores | 2-pass tombstone rebuild — removed rumors are completely erased from state |
| Score manipulation over time | Append-only OpLog — past state is cryptographically immutable |

---

## Tech Stack

**Identity & Privacy**
- [Semaphore Protocol](https://semaphore.pse.dev/) — ZK group membership proofs
- ZK-Email / DKIM — cryptographic university email verification
- Poseidon hash (Baby Jubjub curve) — ZK-friendly nullifier generation

**Truth Scoring**
- Bayesian Truth Serum (Prelec, 2004) — incentive-compatible voting for N ≥ 30
- Robust BTS with peer-pairing — handles small populations (N ≥ 3)
- Personalized PageRank — weights votes by historical accuracy, not just quantity

**Sybil & Bot Resistance**
- Pearson correlation clustering (Union-Find) — detects accounts voting in lockstep
- Correlation dampener — bot clusters reduced to ~1/11th effective weight
- Group slash — coordinated attackers penalized at `O(log k)` scale

**Network & Storage**
- [libp2p](https://libp2p.io/) — encrypted P2P transport (Noise protocol)
- GossipSub — topic-based message propagation
- Kademlia DHT — distributed peer discovery
- mDNS — local network (campus WiFi) peer discovery
- OrbitDB / IPFS — distributed append-only log

**Backend**
- Node.js ≥ 18

---

## Quick Start

### Prerequisites
- Node.js ≥ 18.0.0
- npm ≥ 9.0.0

### Installation

```bash
git clone https://github.com/Hassan-Shahid123/afwaah-campus-rumour-system.git
cd afwaah-campus-rumour-system/backend
npm install
npm test
```

**216 tests. 4 suites. All passing.**

| Suite | Tests |
|---|---|
| Identity (DKIM, Semaphore, Merkle tree) | 37 |
| Scoring (BTS, RBTS, correlation, reputation, PPR) | 95 |
| Network (libp2p, GossipSub, anti-entropy sync) | 41 |
| Integration (full flow, tombstones, snapshotter) | 43 |
| **Total** | **216** |

---

## Using ZK Email Verification

To join the anonymous group, you prove ownership of a university email without revealing the address. This requires a `.eml` file.

**Getting a `.eml` from Gmail:**
1. Open any email from your university inbox
2. Click the three-dot menu → **"Download message"**
3. Upload the downloaded `.eml` file to Afwaah

The system verifies the DKIM cryptographic signature in the email (fetching the RSA public key directly from your university's DNS), confirms the signing domain is a known university domain, and checks the `Delivered-To` header to confirm it reached your inbox — all without ever seeing your email address.

### Configuring Allowed Domains

```javascript
// backend/src/config.js
export const IDENTITY = {
  ALLOWED_DOMAINS: ['seecs.edu.pk', 'your-university.edu'],
};
```

---

## Live Demo

[https://afwaah-campus-rumour-system-murex.vercel.app/](https://afwaah-campus-rumour-system-murex.vercel.app/)

---

## References

1. Prelec, D. (2004). "A Bayesian Truth Serum for Subjective Data." *Science*, 306(5695), 462–466.
2. Prelec, D., Seung, H. S., & McCoy, J. (2017). "A solution to the single-question crowd wisdom problem." *Nature*, 541, 532–535.
3. [Semaphore Protocol](https://semaphore.pse.dev/)
4. [libp2p](https://libp2p.io/)
5. Grassi et al. (2021). "Poseidon: A New Hash Function for Zero-Knowledge Proof Systems."

---

*216 tests passing. Zero central authorities.*
