# Afwaah — Protocol Specification

> **Version:** 1.0  
> **Status:** Draft  
> **Scope:** Wire protocol, message formats, gossip topics, validation rules

---

## 1. Gossipsub Topics

All messages are propagated via libp2p's gossipsub protocol. Each topic carries a specific message type with strict validation rules.

| Topic | Message Type | Validation |
|-------|-------------|------------|
| `/afwaah/rumors/1.0` | RumorMessage | ZK proof valid, nullifier unique |
| `/afwaah/votes/1.0` | VoteMessage | ZK proof valid, nullifier unique, stake ≥ min |
| `/afwaah/identity/1.0` | JoinMessage | DKIM proof valid, commitment unique |
| `/afwaah/tombstone/1.0` | TombstoneMessage | Author nullifier matches original, ZK proof valid |
| `/afwaah/sync/1.0` | SyncRequest/SyncResponse | Merkle root exchange for anti-entropy |

---

## 2. Message Schemas

### 2.1 JoinMessage

Broadcast when a new student joins the network.

```json
{
  "type": "JOIN",
  "version": "1.0",
  "payload": {
    "commitment": "0x...",
    "dkimProof": {
      "domain": "university.edu",
      "proof": "base64-encoded-zk-proof",
      "publicSignals": ["..."]
    },
    "merkleIndex": 42,
    "timestamp": 1738800000000
  },
  "signature": "0x..."
}
```

**Validation Rules:**
1. `dkimProof` must verify against the ZK-Email circuit
2. `domain` must be in the allowed university domains list
3. `commitment` must not already exist in the identities KVStore
4. `merkleIndex` must equal current tree size (append-only)

---

### 2.2 RumorMessage

Broadcast when a verified student posts a new rumor.

```json
{
  "type": "RUMOR",
  "version": "1.0",
  "payload": {
    "id": "CID-of-this-message",
    "text": "The Dean is cancelling Friday classes",
    "topic": "administration",
    "zkProof": {
      "proof": "base64-encoded-semaphore-proof",
      "merkleRoot": "0x...",
      "nullifierHash": "0x...",
      "externalNullifier": "0x..."
    },
    "timestamp": 1738800060000
  }
}
```

**Validation Rules:**
1. `zkProof.proof` must verify against the Semaphore V4 verifier
2. `zkProof.merkleRoot` must match one of the last 10 known tree roots (allows for propagation delay)
3. `zkProof.nullifierHash` must not exist in the rumors EventLog (no duplicate posts with same nullifier)
4. `text` must be non-empty and ≤ 2000 characters
5. `topic` must be one of the allowed categories

**Allowed Topics:**
- `administration` — University policies, staff decisions
- `safety` — Campus safety, emergencies
- `events` — Social events, gatherings
- `academic` — Classes, exams, grades
- `facilities` — Buildings, infrastructure
- `general` — Anything else

---

### 2.3 VoteMessage

Broadcast when a verified student votes on a rumor using the BTS dual-question format.

```json
{
  "type": "VOTE",
  "version": "1.0",
  "payload": {
    "rumorId": "CID-of-the-rumor",
    "vote": "TRUE",
    "prediction": {
      "TRUE": 0.60,
      "FALSE": 0.30,
      "UNVERIFIED": 0.10
    },
    "stakeAmount": 5,
    "zkProof": {
      "proof": "base64-encoded-semaphore-proof",
      "merkleRoot": "0x...",
      "nullifierHash": "0x...",
      "externalNullifier": "0x..."
    },
    "timestamp": 1738800120000
  }
}
```

**Validation Rules:**
1. `zkProof` must verify (same as RumorMessage)
2. `nullifierHash` must not exist in votes EventLog for this `rumorId` (prevents double-voting)
3. `externalNullifier` must be derived from the `rumorId` (ties the nullifier to the specific rumor)
4. `vote` must be one of: `"TRUE"`, `"FALSE"`, `"UNVERIFIED"`
5. `prediction` values must sum to 1.0 (±0.01 tolerance)
6. `stakeAmount` must be ≥ minimum stake AND ≤ voter's current reputation score
7. `rumorId` must reference an existing, non-tombstoned rumor

---

### 2.4 TombstoneMessage

Broadcast to logically delete a rumor (append-only — the original data persists in the log).

```json
{
  "type": "TOMBSTONE",
  "version": "1.0",
  "payload": {
    "rumorId": "CID-of-rumor-to-delete",
    "reason": "retracted",
    "zkProof": {
      "proof": "base64-encoded-semaphore-proof",
      "merkleRoot": "0x...",
      "nullifierHash": "0x...",
      "externalNullifier": "0x..."
    },
    "timestamp": 1738800180000
  }
}
```

**Validation Rules:**
1. `zkProof` must verify
2. The `nullifierHash` must prove the sender is the original author of the rumor (derived from same secret + original rumorId)
3. `reason` must be one of: `"retracted"`, `"duplicate"`, `"community_flagged"`
4. Only the original author can tombstone their own rumor (enforced cryptographically via nullifier)

---

### 2.5 OfficialProofMessage

Broadcast when a student injects an official university statement as evidence.

```json
{
  "type": "OFFICIAL_PROOF",
  "version": "1.0",
  "payload": {
    "rumorId": "CID-of-related-rumor",
    "emailProof": {
      "domain": "admin.university.edu",
      "subject": "Official: Friday classes confirmed",
      "proof": "base64-encoded-zk-email-proof",
      "publicSignals": ["..."]
    },
    "impact": "CONTRADICTS",
    "zkProof": {
      "proof": "base64-encoded-semaphore-proof",
      "merkleRoot": "0x...",
      "nullifierHash": "0x...",
      "externalNullifier": "0x..."
    },
    "timestamp": 1738800240000
  }
}
```

**Validation Rules:**
1. Both `emailProof` and `zkProof` (Semaphore) must verify
2. `emailProof.domain` must be in the trusted admin domains list
3. `impact` must be one of: `"CONFIRMS"`, `"CONTRADICTS"`, `"NEUTRAL"`
4. `rumorId` must reference an existing rumor

---

### 2.6 SyncRequest / SyncResponse

Used for anti-entropy synchronization when a node reconnects.

```json
// SyncRequest
{
  "type": "SYNC_REQUEST",
  "version": "1.0",
  "payload": {
    "stores": {
      "rumors": { "head": "CID-of-latest-entry", "length": 1542 },
      "votes": { "head": "CID-of-latest-entry", "length": 8923 },
      "identities": { "merkleRoot": "0x...", "count": 312 }
    },
    "timestamp": 1738800300000
  }
}

// SyncResponse
{
  "type": "SYNC_RESPONSE",
  "version": "1.0",
  "payload": {
    "missingEntries": ["CID1", "CID2", "CID3"],
    "merkleDiff": {
      "store": "rumors",
      "branches": ["path/to/differing/branch"]
    }
  }
}
```

---

## 3. Nullifier Derivation

Nullifiers are the core mechanism preventing double-voting and enabling authorship verification.

### 3.1 Rumor Posting Nullifier

```
nullifier = Poseidon(identitySecret, RUMOR_SCOPE, rumorNonce)
```

- `identitySecret`: The student's private Semaphore secret (never leaves device)
- `RUMOR_SCOPE`: A constant scope identifier for posting (e.g., `hash("AFWAAH_POST")`)
- `rumorNonce`: A random nonce chosen by the poster (allows multiple posts)

### 3.2 Vote Nullifier

```
nullifier = Poseidon(identitySecret, rumorId)
```

- `identitySecret`: Same as above
- `rumorId`: The CID of the rumor being voted on

This means: for any given rumor, a student's secret will always produce the exact same nullifier. If a second vote arrives with the same nullifier, the network rejects it.

### 3.3 External Nullifier

The `externalNullifier` in the Semaphore proof is set to:
- For posts: `hash("AFWAAH_POST_" + topicName)`
- For votes: `hash("AFWAAH_VOTE_" + rumorId)`

This scopes the nullifier to the specific action, preventing cross-action nullifier collisions.

---

## 4. Gossip Validation Pipeline

When a peer receives a gossipsub message, it passes through a validation pipeline before being accepted:

```
Incoming Message
      │
      ▼
┌─────────────┐     REJECT
│ Parse JSON  │────────────► Drop message
│ Schema check│
└──────┬──────┘
       │ VALID
       ▼
┌─────────────┐     REJECT
│ Check       │────────────► Drop + maybe ban peer
│ version     │
└──────┬──────┘
       │ VALID
       ▼
┌─────────────┐     REJECT
│ Verify ZK   │────────────► Drop message
│ Proof       │
└──────┬──────┘
       │ VALID
       ▼
┌─────────────┐     REJECT
│ Check       │────────────► Drop (double vote/post)
│ Nullifier   │
└──────┬──────┘
       │ UNIQUE
       ▼
┌─────────────┐     REJECT
│ Domain-     │────────────► Drop (wrong topic, bad stake, etc.)
│ specific    │
│ rules       │
└──────┬──────┘
       │ VALID
       ▼
┌─────────────┐
│ Accept      │
│ → OrbitDB   │
│ → Gossip    │
│   forward   │
└─────────────┘
```

---

## 5. OrbitDB Store Configuration

### 5.1 Rumors EventLog

```javascript
{
  name: 'afwaah.rumors',
  type: 'eventlog',
  accessController: {
    type: 'orbitdb',
    write: ['*']  // Anyone with valid ZK proof can write
  },
  replicate: true
}
```

### 5.2 Votes EventLog

```javascript
{
  name: 'afwaah.votes',
  type: 'eventlog',
  accessController: {
    type: 'orbitdb',
    write: ['*']
  },
  replicate: true
}
```

### 5.3 Identities KVStore

```javascript
{
  name: 'afwaah.identities',
  type: 'keyvalue',
  accessController: {
    type: 'orbitdb',
    write: ['*']
  },
  replicate: true
}
```

### 5.4 Reputation KVStore

```javascript
{
  name: 'afwaah.reputation',
  type: 'keyvalue',
  accessController: {
    type: 'orbitdb',
    write: ['*']  // Every node writes its own computed view
  },
  replicate: true
}
```

---

## 6. Network Constants

```javascript
const PROTOCOL_CONFIG = {
  // Gossipsub
  GOSSIP_HEARTBEAT_INTERVAL: 1000,     // ms
  GOSSIP_FANOUT_TTL: 60000,            // ms
  GOSSIP_MESH_SIZE: 6,                 // D parameter
  GOSSIP_MESH_LOW: 4,                  // D_low
  GOSSIP_MESH_HIGH: 12,               // D_high

  // Scoring
  MIN_STAKE_TO_VOTE: 1,
  MIN_STAKE_TO_POST: 5,
  INITIAL_TRUST_SCORE: 10,
  SNAPSHOT_INTERVAL: 10,               // rebuild view every 10 operations
  BTS_ALPHA: 1.0,                      // weight of prediction component
  CORRELATION_LAMBDA: 10.0,            // sensitivity of bot detection
  RBTS_THRESHOLD: 30,                  // switch to RBTS below this N

  // Identity
  MERKLE_TREE_DEPTH: 20,              // supports 2^20 = ~1M users
  ALLOWED_DOMAINS: ['university.edu', 'student.university.edu'],
  ADMIN_DOMAINS: ['admin.university.edu'],
  ROOT_HISTORY_SIZE: 10,              // accept last 10 Merkle roots

  // Network
  MAX_RUMOR_LENGTH: 2000,             // characters
  MAX_MESSAGE_SIZE: 65536,            // bytes
  SYNC_COOLDOWN: 30000,              // ms between sync requests
  PEER_SCORE_DECAY: 0.99,            // libp2p peer scoring decay
};
```

---

## 7. Error Codes

| Code | Name | Description |
|------|------|-------------|
| `E001` | `INVALID_ZK_PROOF` | Semaphore proof verification failed |
| `E002` | `DUPLICATE_NULLIFIER` | This nullifier has already been used |
| `E003` | `INVALID_DKIM` | DKIM proof verification failed |
| `E004` | `UNKNOWN_DOMAIN` | Email domain not in allowed list |
| `E005` | `DUPLICATE_COMMITMENT` | Identity commitment already registered |
| `E006` | `STALE_MERKLE_ROOT` | Merkle root not in recent root history |
| `E007` | `INSUFFICIENT_STAKE` | Trust score below minimum for this action |
| `E008` | `INVALID_PREDICTION` | Prediction values don't sum to 1.0 |
| `E009` | `RUMOR_NOT_FOUND` | Referenced rumor CID doesn't exist |
| `E010` | `RUMOR_TOMBSTONED` | Referenced rumor has been logically deleted |
| `E011` | `UNAUTHORIZED_TOMBSTONE` | Tombstone sender is not the original author |
| `E012` | `MESSAGE_TOO_LARGE` | Message exceeds MAX_MESSAGE_SIZE |
| `E013` | `INVALID_VOTE_VALUE` | Vote is not TRUE/FALSE/UNVERIFIED |
| `E014` | `SCHEMA_VIOLATION` | Message doesn't match expected schema |
