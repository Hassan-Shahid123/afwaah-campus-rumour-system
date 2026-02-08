# Technical Reference

This section contains the detailed technical documentation for the Afwaah project. These documents are intended for developers and contributors who need to understand the specific implementation details of the system.

## Table of Contents

- **[01: Architecture Design](./01-architecture.md)**
  - Detailed diagrams and explanations of the system's architecture, data flows, and component interactions.

- **[02: Protocol Specification](./02-protocol.md)**
  - The complete specification for the P2P network protocol, including message formats, validation rules, and gossipsub topic definitions.

- **[03: Scoring Engine Specification](./03-scoring-engine.md)**
  - The mathematical foundation of the Bayesian Truth Serum (BTS) and Reputation-Based Truth Serum (RBTS) implementation, including the formulas for scoring, reputation updates, and correlation dampening.

- **[04: Identity & Membership](./04-identity.md)**
  - A deep dive into the ZK-Email and Semaphore integration for anonymous identity and group membership.

- **[05: P2P Network & Storage](./05-network-storage.md)**
  - Details on the libp2p and OrbitDB/Helia implementation, covering node setup, gossipsub controllers, and decentralized database management.

- **[06: Scoring Logic & Reputation](./06-scoring-logic.md)**
  - Implementation details of the scoring and reputation engines.

- **[07: Security & State](./07-security-state.md)**
  - Information on the system's security features, including tombstone deletions for handling content removal, state snapshots for recovery, and anti-entropy for data synchronization.

- **[08: System Justification](./08-system-justification.md)**
  - A document outlining the design choices and justifications for the technologies and approaches used in the project.
