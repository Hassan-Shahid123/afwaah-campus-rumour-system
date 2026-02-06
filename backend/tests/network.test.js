// ─────────────────────────────────────────────────────────────
// Afwaah — Phase 2 Tests: P2P Network & Data Layer
//
// Tests the libp2p node, gossip controller, database manager,
// and store manager in isolation and in integration.
//
// Run: npx --node-options="--experimental-vm-modules" jest tests/network.test.js --verbose
// ─────────────────────────────────────────────────────────────

import { jest, describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { AfwaahNode, buildNodeConfig } from '../src/network/node.js';
import { GossipController } from '../src/network/gossip-controller.js';
import { DatabaseManager } from '../src/storage/db.js';
import { StoreManager } from '../src/storage/stores.js';
import { PROTOCOL, NETWORK, STORAGE } from '../src/config.js';

// Increase timeout — P2P setup can be slow
jest.setTimeout(60000);

// ─────────────────────────────────────────────────────────────
// 1. AfwaahNode — unit tests
// ─────────────────────────────────────────────────────────────
describe('AfwaahNode', () => {
  /** @type {AfwaahNode} */
  let node;

  afterEach(async () => {
    if (node && node.isStarted) {
      await node.stop();
    }
  });

  test('should build default config with expected shape', () => {
    const config = buildNodeConfig();
    expect(config.addresses).toBeDefined();
    expect(config.addresses.listen).toContain('/ip4/0.0.0.0/tcp/0');
    expect(config.transports).toHaveLength(1);
    expect(config.streamMuxers).toHaveLength(1);
    expect(config.connectionEncrypters).toHaveLength(1);
    expect(config.peerDiscovery).toHaveLength(1);
    expect(config.services.pubsub).toBeDefined();
    expect(config.services.dht).toBeDefined();
    expect(config.services.identify).toBeDefined();
  });

  test('should accept config overrides', () => {
    const config = buildNodeConfig({
      addresses: { listen: ['/ip4/127.0.0.1/tcp/9999'] },
    });
    expect(config.addresses.listen).toContain('/ip4/127.0.0.1/tcp/9999');
  });

  test('should start and expose peerId', async () => {
    node = new AfwaahNode();
    await node.start();

    expect(node.isStarted).toBe(true);
    expect(node.peerId).toBeDefined();
    expect(node.peerId.toString()).toBeTruthy();
  });

  test('should expose multiaddrs after start', async () => {
    node = new AfwaahNode();
    await node.start();

    const addrs = node.getMultiaddrs();
    expect(Array.isArray(addrs)).toBe(true);
    expect(addrs.length).toBeGreaterThan(0);
  });

  test('should subscribe to all Afwaah topics on start', async () => {
    node = new AfwaahNode();
    await node.start();

    const topics = node.pubsub.getTopics();
    for (const topic of Object.values(PROTOCOL.TOPICS)) {
      expect(topics).toContain(topic);
    }
  });

  test('should expose the DHT service', async () => {
    node = new AfwaahNode();
    await node.start();

    expect(node.dht).toBeDefined();
  });

  test('should stop cleanly', async () => {
    node = new AfwaahNode();
    await node.start();
    await node.stop();

    expect(node.isStarted).toBe(false);
    expect(node.libp2p).toBeNull();
  });

  test('should throw when accessing pubsub before start', () => {
    node = new AfwaahNode();
    expect(() => node.pubsub).toThrow('not started');
  });

  test('should throw when accessing peerId before start', () => {
    node = new AfwaahNode();
    expect(() => node.peerId).toThrow('not started');
  });

  test('should be idempotent on double-start', async () => {
    node = new AfwaahNode();
    await node.start();
    const peerId1 = node.peerId.toString();
    await node.start(); // should no-op
    expect(node.peerId.toString()).toBe(peerId1);
  });

  test('should be idempotent on double-stop', async () => {
    node = new AfwaahNode();
    await node.start();
    await node.stop();
    await node.stop(); // should no-op
    expect(node.isStarted).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. GossipController — unit tests
// ─────────────────────────────────────────────────────────────
describe('GossipController', () => {
  /** @type {AfwaahNode} */
  let node;
  /** @type {GossipController} */
  let gc;

  beforeAll(async () => {
    node = new AfwaahNode();
    await node.start();
    gc = new GossipController(node);
    gc.start();
  });

  afterAll(async () => {
    gc.stop();
    await node.stop();
  });

  test('should start without error', () => {
    expect(gc._started).toBe(true);
  });

  test('should track nullifiers', () => {
    expect(gc.nullifierCount).toBe(0);
    gc.addNullifier('test-null-1');
    expect(gc.hasNullifier('test-null-1')).toBe(true);
    expect(gc.hasNullifier('unknown')).toBe(false);
    expect(gc.nullifierCount).toBe(1);
  });

  test('should create a valid rumor envelope', async () => {
    // Can publish without error (no peers connected = ok because allowPublishToZeroTopicPeers)
    const payload = {
      id: 'QmFakeHash',
      text: 'Test rumor',
      topic: 'general',
      zkProof: {
        proof: 'base64proof',
        merkleRoot: '0xabc',
        nullifierHash: '0x123',
        externalNullifier: '0xext',
      },
    };

    // Should not throw
    await gc.publishRumor(payload);
  });

  test('should create a valid vote envelope', async () => {
    const payload = {
      rumorId: 'QmFakeRumor',
      vote: 'TRUE',
      prediction: { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 },
      stakeAmount: 5,
      zkProof: {
        proof: 'base64proof',
        merkleRoot: '0xabc',
        nullifierHash: '0x456',
        externalNullifier: '0xext',
      },
    };

    await gc.publishVote(payload);
  });

  test('should create a valid join envelope', async () => {
    const payload = {
      commitment: '0xcommitment123',
      dkimProof: {
        domain: 'university.edu',
        proof: 'base64-dkim',
        publicSignals: ['sig1'],
      },
      merkleIndex: 0,
    };

    await gc.publishJoin(payload);
  });

  test('should create a valid tombstone envelope', async () => {
    const payload = {
      rumorId: 'QmFakeRumor',
      reason: 'retracted',
      zkProof: {
        proof: 'base64proof',
        merkleRoot: '0xabc',
        nullifierHash: '0x789',
        externalNullifier: '0xext',
      },
    };

    await gc.publishTombstone(payload);
  });

  test('should create a valid sync envelope', async () => {
    const payload = {
      stores: {
        rumors: { head: 'CID1', length: 10 },
        votes: { head: 'CID2', length: 20 },
        identities: { merkleRoot: '0xabc', count: 5 },
      },
    };

    await gc.publishSync(payload);
  });

  test('should reject messages exceeding max size', async () => {
    const bigText = 'x'.repeat(NETWORK.MAX_MESSAGE_SIZE + 1);
    const payload = {
      id: 'big',
      text: bigText,
      topic: 'general',
      zkProof: { proof: '', merkleRoot: '', nullifierHash: '0xbig', externalNullifier: '' },
    };

    await expect(gc.publishRumor(payload)).rejects.toThrow('E012');
  });
});

// ─────────────────────────────────────────────────────────────
// 3. GossipController — message validation (simulated)
// ─────────────────────────────────────────────────────────────
describe('GossipController Validation', () => {
  /** @type {GossipController} */
  let gc;
  /** @type {AfwaahNode} */
  let node;

  beforeAll(async () => {
    node = new AfwaahNode();
    await node.start();
    gc = new GossipController(node);
    gc.start();
  });

  afterAll(async () => {
    gc.stop();
    await node.stop();
  });

  /**
   * Helper to simulate receiving a gossipsub message.
   */
  function simulateMessage(topic, msgObj) {
    const data = new TextEncoder().encode(JSON.stringify(msgObj));
    gc._onGossipMessage({
      detail: {
        msg: { topic, data },
        msgId: 'test-msg-id',
      },
    });
  }

  test('should dispatch valid rumor to handler', (done) => {
    gc.onRumor((parsed) => {
      expect(parsed.type).toBe('RUMOR');
      expect(parsed.payload.text).toBe('Campus fire drill at 2pm');
      done();
    });

    simulateMessage(PROTOCOL.TOPICS.RUMORS, {
      type: 'RUMOR',
      version: '1.0',
      payload: {
        id: 'QmTest1',
        text: 'Campus fire drill at 2pm',
        topic: 'safety',
        zkProof: {
          proof: 'proof1',
          merkleRoot: '0xroot',
          nullifierHash: '0xnull_valid_rumor_1',
          externalNullifier: '0xext',
        },
        timestamp: Date.now(),
      },
    });
  });

  test('should reject rumor with invalid topic', () => {
    let received = false;
    // Create a fresh handler set for this test
    const origHandlers = gc._handlers.get(PROTOCOL.TOPICS.RUMORS);
    gc._handlers.set(PROTOCOL.TOPICS.RUMORS, new Set([() => { received = true; }]));

    simulateMessage(PROTOCOL.TOPICS.RUMORS, {
      type: 'RUMOR',
      version: '1.0',
      payload: {
        id: 'QmBad',
        text: 'bad rumor',
        topic: 'INVALID_TOPIC',
        zkProof: {
          proof: 'p',
          merkleRoot: '0x',
          nullifierHash: '0xnull_invalid_topic',
          externalNullifier: '0x',
        },
        timestamp: Date.now(),
      },
    });

    expect(received).toBe(false);
    gc._handlers.set(PROTOCOL.TOPICS.RUMORS, origHandlers); // restore
  });

  test('should reject rumor exceeding max length', () => {
    let received = false;
    const origHandlers = gc._handlers.get(PROTOCOL.TOPICS.RUMORS);
    gc._handlers.set(PROTOCOL.TOPICS.RUMORS, new Set([() => { received = true; }]));

    simulateMessage(PROTOCOL.TOPICS.RUMORS, {
      type: 'RUMOR',
      version: '1.0',
      payload: {
        id: 'QmLong',
        text: 'x'.repeat(2001),
        topic: 'general',
        zkProof: {
          proof: 'p',
          merkleRoot: '0x',
          nullifierHash: '0xnull_toolong',
          externalNullifier: '0x',
        },
        timestamp: Date.now(),
      },
    });

    expect(received).toBe(false);
    gc._handlers.set(PROTOCOL.TOPICS.RUMORS, origHandlers);
  });

  test('should reject vote with invalid prediction sum', () => {
    let received = false;
    gc._handlers.set(PROTOCOL.TOPICS.VOTES, new Set([() => { received = true; }]));

    simulateMessage(PROTOCOL.TOPICS.VOTES, {
      type: 'VOTE',
      version: '1.0',
      payload: {
        rumorId: 'QmRumor',
        vote: 'TRUE',
        prediction: { TRUE: 0.9, FALSE: 0.5, UNVERIFIED: 0.1 }, // sums to 1.5
        stakeAmount: 5,
        zkProof: {
          proof: 'p',
          merkleRoot: '0x',
          nullifierHash: '0xnull_badpred',
          externalNullifier: '0x',
        },
        timestamp: Date.now(),
      },
    });

    expect(received).toBe(false);
  });

  test('should reject vote with invalid vote value', () => {
    let received = false;
    gc._handlers.set(PROTOCOL.TOPICS.VOTES, new Set([() => { received = true; }]));

    simulateMessage(PROTOCOL.TOPICS.VOTES, {
      type: 'VOTE',
      version: '1.0',
      payload: {
        rumorId: 'QmRumor',
        vote: 'MAYBE',
        prediction: { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 },
        stakeAmount: 5,
        zkProof: {
          proof: 'p',
          merkleRoot: '0x',
          nullifierHash: '0xnull_badvote',
          externalNullifier: '0x',
        },
        timestamp: Date.now(),
      },
    });

    expect(received).toBe(false);
  });

  test('should reject duplicate nullifiers', () => {
    const callLog = [];
    gc._handlers.set(PROTOCOL.TOPICS.RUMORS, new Set([(parsed) => {
      callLog.push(parsed.payload.id);
    }]));

    const msg = {
      type: 'RUMOR',
      version: '1.0',
      payload: {
        id: 'QmDupe',
        text: 'dupe test',
        topic: 'general',
        zkProof: {
          proof: 'p',
          merkleRoot: '0x',
          nullifierHash: '0xDUPLICATE_NULLIFIER',
          externalNullifier: '0x',
        },
        timestamp: Date.now(),
      },
    };

    simulateMessage(PROTOCOL.TOPICS.RUMORS, msg);
    simulateMessage(PROTOCOL.TOPICS.RUMORS, msg); // same nullifier — should be dropped

    expect(callLog).toHaveLength(1);
  });

  test('should reject messages with wrong version', () => {
    let received = false;
    gc._handlers.set(PROTOCOL.TOPICS.RUMORS, new Set([() => { received = true; }]));

    simulateMessage(PROTOCOL.TOPICS.RUMORS, {
      type: 'RUMOR',
      version: '99.0',
      payload: {
        id: 'QmBadVer',
        text: 'bad version',
        topic: 'general',
        zkProof: { proof: 'p', merkleRoot: '0x', nullifierHash: '0xbadver', externalNullifier: '0x' },
        timestamp: Date.now(),
      },
    });

    expect(received).toBe(false);
  });

  test('should reject malformed JSON', () => {
    let received = false;
    gc._handlers.set(PROTOCOL.TOPICS.RUMORS, new Set([() => { received = true; }]));

    // Directly call with invalid data
    gc._onGossipMessage({
      detail: {
        msg: {
          topic: PROTOCOL.TOPICS.RUMORS,
          data: new TextEncoder().encode('NOT_JSON{{{'),
        },
        msgId: 'bad-json',
      },
    });

    expect(received).toBe(false);
  });

  test('should dispatch valid join to handler', (done) => {
    gc.onJoin((parsed) => {
      expect(parsed.type).toBe('JOIN');
      expect(parsed.payload.commitment).toBe('0xNewStudent');
      done();
    });

    simulateMessage(PROTOCOL.TOPICS.IDENTITY, {
      type: 'JOIN',
      version: '1.0',
      payload: {
        commitment: '0xNewStudent',
        dkimProof: { domain: 'university.edu', proof: 'p', publicSignals: [] },
        merkleIndex: 10,
        timestamp: Date.now(),
      },
    });
  });

  test('should dispatch valid tombstone to handler', (done) => {
    gc.onTombstone((parsed) => {
      expect(parsed.type).toBe('TOMBSTONE');
      expect(parsed.payload.reason).toBe('retracted');
      done();
    });

    simulateMessage(PROTOCOL.TOPICS.TOMBSTONE, {
      type: 'TOMBSTONE',
      version: '1.0',
      payload: {
        rumorId: 'QmToDelete',
        reason: 'retracted',
        zkProof: {
          proof: 'p',
          merkleRoot: '0x',
          nullifierHash: '0xnull_tombstone_test',
          externalNullifier: '0x',
        },
        timestamp: Date.now(),
      },
    });
  });
});

// ─────────────────────────────────────────────────────────────
// 4. DatabaseManager — unit tests
// ─────────────────────────────────────────────────────────────
describe('DatabaseManager', () => {
  /** @type {DatabaseManager} */
  let db;

  afterEach(async () => {
    if (db && db.isStarted) {
      await db.stop();
    }
  });

  test('should start with standalone Helia (no external libp2p)', async () => {
    db = new DatabaseManager({ directory: './test-orbitdb-1' });
    await db.start();

    expect(db.isStarted).toBe(true);
    expect(db.helia).toBeDefined();
    expect(db.orbitdb).toBeDefined();
  });

  test('should expose OrbitDB and Helia via getters', async () => {
    db = new DatabaseManager({ directory: './test-orbitdb-2' });
    await db.start();

    expect(db.getOrbitDB()).toBe(db.orbitdb);
    expect(db.getHelia()).toBe(db.helia);
  });

  test('should throw when accessing OrbitDB before start', () => {
    db = new DatabaseManager();
    expect(() => db.getOrbitDB()).toThrow('not started');
  });

  test('should stop cleanly', async () => {
    db = new DatabaseManager({ directory: './test-orbitdb-3' });
    await db.start();
    await db.stop();

    expect(db.isStarted).toBe(false);
    expect(db.orbitdb).toBeNull();
    expect(db.helia).toBeNull();
  });

  test('should be idempotent on double-start and double-stop', async () => {
    db = new DatabaseManager({ directory: './test-orbitdb-4' });
    await db.start();
    await db.start(); // no-op
    expect(db.isStarted).toBe(true);

    await db.stop();
    await db.stop(); // no-op
    expect(db.isStarted).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. StoreManager — unit tests
// ─────────────────────────────────────────────────────────────
describe('StoreManager', () => {
  /** @type {DatabaseManager} */
  let db;
  /** @type {StoreManager} */
  let sm;

  beforeAll(async () => {
    db = new DatabaseManager({ directory: './test-orbitdb-stores' });
    await db.start();
    sm = new StoreManager(db.getOrbitDB());
    await sm.open();
  });

  afterAll(async () => {
    if (sm && sm.isOpen) await sm.close();
    if (db && db.isStarted) await db.stop();
  });

  test('should open all four stores', () => {
    expect(sm.isOpen).toBe(true);
    expect(sm.rumors).toBeDefined();
    expect(sm.votes).toBeDefined();
    expect(sm.identities).toBeDefined();
    expect(sm.reputation).toBeDefined();
  });

  test('should expose store addresses', () => {
    const addrs = sm.getAddresses();
    expect(addrs.rumors).toBeDefined();
    expect(addrs.votes).toBeDefined();
    expect(addrs.identities).toBeDefined();
    expect(addrs.reputation).toBeDefined();
  });

  // ── Rumors store ──────────────────────────────────────────

  test('should add and retrieve a rumor', async () => {
    const hash = await sm.addRumor({
      text: 'The cafeteria has new vegan options',
      topic: 'facilities',
      zkProof: { proof: 'p', merkleRoot: '0x', nullifierHash: '0x1' },
    });

    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);

    const rumor = await sm.getRumor(hash);
    expect(rumor).toBeDefined();
    expect(rumor.text).toBe('The cafeteria has new vegan options');
    expect(rumor.topic).toBe('facilities');
    expect(rumor.timestamp).toBeDefined();
  });

  test('should list all rumors', async () => {
    await sm.addRumor({
      text: 'Library closing early on Friday',
      topic: 'facilities',
      zkProof: { proof: 'p', merkleRoot: '0x', nullifierHash: '0x2' },
    });

    const all = await sm.getAllRumors();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test('should limit rumor results', async () => {
    const limited = await sm.getAllRumors(1);
    expect(limited).toHaveLength(1);
  });

  // ── Votes store ───────────────────────────────────────────

  test('should add and retrieve votes', async () => {
    const hash = await sm.addVote({
      rumorId: 'QmTestRumor',
      vote: 'TRUE',
      prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 },
      stakeAmount: 5,
      zkProof: { proof: 'p', merkleRoot: '0x', nullifierHash: '0xv1' },
    });

    expect(typeof hash).toBe('string');

    const all = await sm.getAllVotes();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  test('should filter votes by rumorId', async () => {
    const targetId = 'QmSpecificRumor';
    await sm.addVote({
      rumorId: targetId,
      vote: 'FALSE',
      prediction: { TRUE: 0.2, FALSE: 0.7, UNVERIFIED: 0.1 },
      stakeAmount: 3,
      zkProof: { proof: 'p', merkleRoot: '0x', nullifierHash: '0xv2' },
    });
    await sm.addVote({
      rumorId: 'QmOtherRumor',
      vote: 'TRUE',
      prediction: { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 },
      stakeAmount: 2,
      zkProof: { proof: 'p', merkleRoot: '0x', nullifierHash: '0xv3' },
    });

    const filtered = await sm.getVotesForRumor(targetId);
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.every(e => e.value.rumorId === targetId)).toBe(true);
  });

  // ── Identities store ─────────────────────────────────────

  test('should register and retrieve identity', async () => {
    const commitment = '123456789n';
    const hash = await sm.registerIdentity(commitment, {
      merkleIndex: 0,
    });

    expect(typeof hash).toBe('string');

    const identity = await sm.getIdentity(commitment);
    expect(identity).toBeDefined();
    expect(identity.merkleIndex).toBe(0);
    expect(identity.joinedAt).toBeDefined();
  });

  test('should list all identities', async () => {
    await sm.registerIdentity('999888777n', { merkleIndex: 1 });

    const all = await sm.getAllIdentities();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  // ── Reputation store ──────────────────────────────────────

  test('should set and retrieve reputation', async () => {
    const nullifierId = 'null_user_1';
    const hash = await sm.setReputation(nullifierId, {
      score: 10,
      history: [],
    });

    expect(typeof hash).toBe('string');

    const rep = await sm.getReputation(nullifierId);
    expect(rep).toBeDefined();
    expect(rep.score).toBe(10);
    expect(rep.lastUpdated).toBeDefined();
  });

  test('should update existing reputation', async () => {
    const nullifierId = 'null_user_2';
    await sm.setReputation(nullifierId, { score: 10, history: [] });
    await sm.setReputation(nullifierId, { score: 8, history: [{ action: 'slash', delta: -2 }] });

    const rep = await sm.getReputation(nullifierId);
    expect(rep.score).toBe(8);
    expect(rep.history).toHaveLength(1);
  });

  test('should list all reputations', async () => {
    const all = await sm.getAllReputations();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  // ── Error handling ────────────────────────────────────────

  test('should throw when using stores before open()', async () => {
    const sm2 = new StoreManager(db.getOrbitDB());
    expect(() => sm2.getAddresses()).toThrow('not open');
    await expect(sm2.addRumor({})).rejects.toThrow('not open');
  });
});

// ─────────────────────────────────────────────────────────────
// 6. Integration — Node + DB + Stores working together
// ─────────────────────────────────────────────────────────────
describe('Phase 2 Integration', () => {
  /** @type {AfwaahNode} */
  let node;
  /** @type {DatabaseManager} */
  let dbManager;
  /** @type {StoreManager} */
  let stores;
  /** @type {GossipController} */
  let gossip;

  beforeAll(async () => {
    // 1. Start P2P node
    node = new AfwaahNode();
    await node.start();

    // 2. Start DB layer (standalone Helia — not sharing libp2p in tests for simplicity)
    dbManager = new DatabaseManager({ directory: './test-orbitdb-integration' });
    await dbManager.start();

    // 3. Open stores
    stores = new StoreManager(dbManager.getOrbitDB());
    await stores.open();

    // 4. Wire up gossip controller
    gossip = new GossipController(node);
    gossip.start();
  });

  afterAll(async () => {
    gossip.stop();
    await stores.close();
    await dbManager.stop();
    await node.stop();
  });

  test('full stack is running', () => {
    expect(node.isStarted).toBe(true);
    expect(dbManager.isStarted).toBe(true);
    expect(stores.isOpen).toBe(true);
    expect(gossip._started).toBe(true);
  });

  test('end-to-end: gossip handler writes rumor to store', async () => {
    // Register a gossip handler that writes to OrbitDB
    const saved = [];
    gossip.onRumor(async (parsed) => {
      const hash = await stores.addRumor(parsed.payload);
      saved.push(hash);
    });

    // Simulate an incoming valid rumor via internal dispatch
    const fakeEvt = {
      detail: {
        msg: {
          topic: PROTOCOL.TOPICS.RUMORS,
          data: new TextEncoder().encode(JSON.stringify({
            type: 'RUMOR',
            version: '1.0',
            payload: {
              id: 'QmIntTest',
              text: 'Integration test rumor',
              topic: 'academic',
              zkProof: {
                proof: 'zk',
                merkleRoot: '0xroot',
                nullifierHash: '0xnull_integration_1',
                externalNullifier: '0xext',
              },
              timestamp: Date.now(),
            },
          })),
        },
      },
    };

    gossip._onGossipMessage(fakeEvt);

    // Give async handler time to write
    await new Promise(r => setTimeout(r, 500));

    expect(saved.length).toBe(1);
    const rumor = await stores.getRumor(saved[0]);
    expect(rumor.text).toBe('Integration test rumor');
    expect(rumor.topic).toBe('academic');
  });

  test('end-to-end: identity join → store → lookup', async () => {
    const commitment = '0xIntTestCommitment';
    await stores.registerIdentity(commitment, { merkleIndex: 42 });

    const found = await stores.getIdentity(commitment);
    expect(found.merkleIndex).toBe(42);
  });

  test('end-to-end: vote → store → filter by rumorId', async () => {
    const rumorId = 'QmIntRumor';
    await stores.addVote({
      rumorId,
      vote: 'TRUE',
      prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 },
      stakeAmount: 5,
    });
    await stores.addVote({
      rumorId,
      vote: 'FALSE',
      prediction: { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 },
      stakeAmount: 3,
    });

    const votes = await stores.getVotesForRumor(rumorId);
    expect(votes.length).toBe(2);
    expect(votes[0].value.rumorId).toBe(rumorId);
  });

  test('end-to-end: reputation lifecycle', async () => {
    const uid = 'int_user_1';

    // Initial score
    await stores.setReputation(uid, { score: 10, history: [] });
    let rep = await stores.getReputation(uid);
    expect(rep.score).toBe(10);

    // After honest vote → reward
    await stores.setReputation(uid, {
      score: 11,
      history: [{ action: 'reward', delta: 1 }],
    });
    rep = await stores.getReputation(uid);
    expect(rep.score).toBe(11);

    // After dishonest vote → slash
    await stores.setReputation(uid, {
      score: 9.5,
      history: [
        { action: 'reward', delta: 1 },
        { action: 'slash', delta: -1.5 },
      ],
    });
    rep = await stores.getReputation(uid);
    expect(rep.score).toBe(9.5);
    expect(rep.history).toHaveLength(2);
  });

  test('node reports connected peers (may be empty in test env)', () => {
    const peers = node.getConnectedPeers();
    expect(Array.isArray(peers)).toBe(true);
    // In CI/test environment, no other peers are running
    console.log(`  Connected peers: ${peers.length}`);
  });
});
