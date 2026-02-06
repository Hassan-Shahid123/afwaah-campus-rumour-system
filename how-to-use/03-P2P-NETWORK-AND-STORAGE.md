# 🌐 Phase 2 — P2P Network & Storage

This module creates a fully decentralized peer-to-peer network for broadcasting rumors, votes, and identity events — with persistent storage via OrbitDB on IPFS.

---

## Concepts

| Concept | What it is |
|---------|------------|
| **libp2p Node** | The transport layer — TCP connections, Noise encryption, GossipSub pub/sub, mDNS local discovery, KadDHT routing. |
| **GossipSub** | A gossip-based pubsub protocol. Messages fan out to mesh peers, ensuring all nodes eventually receive every rumor/vote. |
| **GossipController** | Application-level bridge between raw GossipSub messages and your handlers. Validates message schemas and deduplicates by nullifier. |
| **Helia + OrbitDB** | Helia = IPFS node. OrbitDB = a database built on top of IPFS. Data is replicated across peers automatically. |
| **StoreManager** | Wraps 4 OrbitDB stores: rumors (event log), votes (event log), identities (key-value), reputation (key-value). |

---

## Quick Start

All examples use ES Modules. Create files inside the `backend/` folder and run with `node <filename>.js`.

---

## Step 1 — Start a P2P Node

```js
import { AfwaahNode } from './src/network/node.js';

// Create and start a node
const node = new AfwaahNode();
await node.start();

console.log('Node started!');
console.log('Peer ID:', node.peerId.toString());
console.log('Listening on:', node.getMultiaddrs().map(ma => ma.toString()));

// The node is now discoverable via mDNS on your local network
// Other Afwaah nodes on the same LAN will auto-discover this node
```

---

## Step 2 — Connect Two Nodes (Same Machine)

Open **two terminals**. In each, run a separate script:

**Terminal 1** — `node1.js`:
```js
import { AfwaahNode } from './src/network/node.js';

const node1 = new AfwaahNode();
await node1.start();

console.log('Node 1 ID:', node1.peerId.toString());
console.log('Node 1 addresses:');
node1.getMultiaddrs().forEach(ma => console.log('  ', ma.toString()));

// Listen for peer connections
node1.onPeerConnect((peerId) => {
  console.log('Node 1: Peer connected!', peerId.toString());
});

// Keep alive
console.log('\nWaiting for peers... (Ctrl+C to stop)');
```

**Terminal 2** — `node2.js`:
```js
import { AfwaahNode } from './src/network/node.js';
import { multiaddr } from '@multiformats/multiaddr';

const node2 = new AfwaahNode();
await node2.start();

console.log('Node 2 ID:', node2.peerId.toString());

// If on similar LAN, mDNS will auto-discover Node 1
// Or manually dial Node 1's address:
// await node2.dial(multiaddr('/ip4/127.0.0.1/tcp/PORT/p2p/PEER_ID'));

node2.onPeerConnect((peerId) => {
  console.log('Node 2: Connected to', peerId.toString());
});

console.log('\nWaiting for peers...');
```

> **On the same machine**: mDNS should auto-discover both nodes within ~10 seconds. You'll see "Peer connected!" in both terminals.

---

## Step 3 — GossipSub: Publish & Subscribe to Rumors

```js
import { AfwaahNode } from './src/network/node.js';
import { GossipController } from './src/network/gossip-controller.js';

const node = new AfwaahNode();
await node.start();

const gossip = new GossipController(node);

// Register handlers BEFORE starting
gossip.onRumor((msg, raw) => {
  console.log('New rumor received:', msg);
});

gossip.onVote((msg, raw) => {
  console.log('New vote received:', msg);
});

gossip.onJoin((msg, raw) => {
  console.log('New member joined:', msg);
});

// Start subscribing to topics
gossip.start();
console.log('Gossip controller started, listening for messages...');
```

---

## Step 4 — Publish a Rumor

```js
// After gossip.start()

await gossip.publishRumor({
  rumorId: 'Qm123abc',
  text: 'The library is closing early this Friday',
  topic: 'facilities',
  timestamp: Date.now(),
  nullifier: 'abc123nullifier',
  zkProof: {
    // ZK proof from Semaphore (see Phase 1)
    proof: '0x...',
    publicSignals: ['...'],
  },
});

console.log('Rumor published!');
```

### Message Validation

The GossipController automatically validates all incoming messages:
- **Rumors**: Must have `rumorId`, `text` (≤ 2000 chars), valid `topic`, `timestamp`, `nullifier`, `zkProof`
- **Votes**: Must have `rumorId`, valid `vote` (TRUE/FALSE/UNVERIFIED), `prediction`, `nullifier`, `zkProof`
- **Nullifier dedup**: Same nullifier is rejected on re-publish (prevents double-posting)

Invalid messages are silently dropped.

---

## Step 5 — Publish a Vote

```js
await gossip.publishVote({
  rumorId: 'Qm123abc',
  vote: 'TRUE',
  prediction: {
    TRUE: 0.7,
    FALSE: 0.2,
    UNVERIFIED: 0.1,
  },
  timestamp: Date.now(),
  nullifier: 'vote-nullifier-xyz',
  stakeAmount: 2,
  zkProof: {
    proof: '0x...',
    publicSignals: ['...'],
  },
});
```

---

## Step 6 — Set Up Decentralized Storage (OrbitDB)

```js
import { DatabaseManager } from './src/storage/db.js';
import { StoreManager } from './src/storage/stores.js';

// Initialize Helia + OrbitDB
const db = new DatabaseManager({ directory: './my-orbitdb' });
await db.start();
console.log('Database started!');

// Open the 4 core stores
const stores = new StoreManager(db.orbitdb);
await stores.open();
console.log('Stores opened!');
```

---

## Step 7 — Store & Retrieve Rumors

```js
// Add a rumor
const hash = await stores.addRumor({
  rumorId: 'Qm123abc',
  text: 'The library is closing early this Friday',
  topic: 'facilities',
  author: 'anon-nullifier-hash',
  timestamp: Date.now(),
  zkProof: { proof: '0x...', publicSignals: [] },
});
console.log('Stored rumor, hash:', hash);

// Get all rumors
const allRumors = await stores.getAllRumors();
console.log('All rumors:', allRumors);

// Get a specific rumor
const rumor = await stores.getRumor('Qm123abc');
console.log('Single rumor:', rumor);
```

---

## Step 8 — Store & Retrieve Votes

```js
// Add a vote
await stores.addVote({
  rumorId: 'Qm123abc',
  vote: 'TRUE',
  prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 },
  voter: 'voter-nullifier-aaa',
  stakeAmount: 2,
  timestamp: Date.now(),
});

// Get all votes for a rumor
const rumorVotes = await stores.getVotesForRumor('Qm123abc');
console.log('Votes:', rumorVotes);
```

---

## Step 9 — Store Identity & Reputation Data

```js
// Store identity metadata
await stores.putIdentity('commitment-abc123', {
  joinedAt: Date.now(),
  domain: 'university.edu',
});

// Store reputation score
await stores.putReputation('voter-nullifier-aaa', {
  score: 10,
  lastUpdated: Date.now(),
});

// Retrieve
const identity = await stores.getIdentity('commitment-abc123');
const reputation = await stores.getReputation('voter-nullifier-aaa');
console.log('Identity:', identity);
console.log('Reputation:', reputation);
```

---

## Step 10 — Clean Shutdown

Always stop services in reverse order:

```js
await stores.close();
console.log('Stores closed');

await db.stop();
console.log('Database stopped');

await node.stop();
console.log('Node stopped');
```

---

## Full Working Example

Save as `backend/demo-network.js`:

```js
import { AfwaahNode } from './src/network/node.js';
import { GossipController } from './src/network/gossip-controller.js';
import { DatabaseManager } from './src/storage/db.js';
import { StoreManager } from './src/storage/stores.js';

async function main() {
  // 1. Start P2P node
  const node = new AfwaahNode();
  await node.start();
  console.log('Node:', node.peerId.toString());

  // 2. Set up gossip
  const gossip = new GossipController(node);
  gossip.onRumor((msg) => console.log('📨 Rumor:', msg.text));
  gossip.onVote((msg) => console.log('🗳️  Vote:', msg.vote));
  gossip.start();

  // 3. Set up storage
  const db = new DatabaseManager({ directory: './demo-orbitdb' });
  await db.start();
  const stores = new StoreManager(db.orbitdb);
  await stores.open();
  console.log('Storage ready!');

  // 4. Store and retrieve a rumor
  await stores.addRumor({
    rumorId: 'QmDemo1',
    text: 'Free pizza in the student lounge at 5 PM!',
    topic: 'events',
    author: 'demo-nullifier',
    timestamp: Date.now(),
    zkProof: { proof: '0x', publicSignals: [] },
  });

  const all = await stores.getAllRumors();
  console.log(`Stored ${all.length} rumor(s)`);

  // 5. Clean shutdown
  await stores.close();
  await db.stop();
  await node.stop();
  console.log('Done!');
}

main().catch(console.error);
```

Run:
```bash
node demo-network.js
```

---

## GossipSub Topics

All messages are published on protocol-specific topics:

| Topic | Purpose |
|-------|---------|
| `/afwaah/rumors/1.0` | New rumor submissions |
| `/afwaah/votes/1.0` | Votes on rumors |
| `/afwaah/identity/1.0` | Member join/leave events |
| `/afwaah/tombstone/1.0` | Rumor takedown notices |
| `/afwaah/sync/1.0` | State synchronization requests |

---

## Running the Tests

```bash
cd backend
npm run test:network
```

All 53 tests should pass, covering:
- Node creation, start, stop
- Peer discovery (mDNS) and manual dialing
- GossipSub publish/subscribe across topics
- Message validation (schema checks)
- Nullifier deduplication
- DatabaseManager (Helia + OrbitDB lifecycle)
- StoreManager CRUD for all 4 stores
- Error handling and edge cases

---

**Next**: [Phase 3 — Scoring Engine →](./04-SCORING-ENGINE.md)
