// ─────────────────────────────────────────────────────────────
// Afwaah — Phase 4: Security Hardening & State Management Tests
//
// Test suites:
//   1. Snapshotter — OpLog traversal, tombstone handling, rebuild
//   2. TombstoneManager — creation, validation, filtering
//   3. TrustPropagator — graph construction, PPR, rumor trust
//   4. AntiEntropySync — Merkle roots, diff, read-repair
//   5. Integration — Full pipeline: join → post → vote → score → delete → rescore
// ─────────────────────────────────────────────────────────────

import { Snapshotter } from '../src/state/snapshotter.js';
import { TombstoneManager } from '../src/state/tombstone-manager.js';
import { TrustPropagator } from '../src/scoring/trust-propagator.js';
import { AntiEntropySync } from '../src/network/anti-entropy.js';
import { BTSEngine } from '../src/scoring/bts-engine.js';
import { RBTSEngine } from '../src/scoring/rbts-engine.js';
import { CorrelationDampener } from '../src/scoring/correlation-dampener.js';
import { ReputationManager } from '../src/scoring/reputation-manager.js';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function makeRumorOp(id, text, nullifier, topic = 'general') {
  return {
    type: 'RUMOR',
    payload: {
      id,
      text,
      topic,
      nullifier,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

function makeVoteOp(rumorId, nullifier, vote, prediction) {
  return {
    type: 'VOTE',
    payload: {
      rumorId,
      nullifier,
      vote,
      prediction: prediction || { TRUE: 0.33, FALSE: 0.33, UNVERIFIED: 0.34 },
      stakeAmount: 1,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

function makeJoinOp(nullifier) {
  return {
    type: 'JOIN',
    payload: {
      commitment: nullifier,
      nullifier,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

function makeTombstoneOp(rumorId, authorNullifier, reason = 'author_requested') {
  return {
    type: 'TOMBSTONE',
    payload: {
      rumorId,
      authorNullifier,
      reason,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. SNAPSHOTTER TESTS
// ═══════════════════════════════════════════════════════════════

describe('Snapshotter', () => {
  let snapper;

  beforeEach(() => {
    snapper = new Snapshotter({ snapshotInterval: 5 });
  });

  // ── Construction & Defaults ────────────────────────────────

  test('initializes with correct defaults', () => {
    expect(snapper.snapshotInterval).toBe(5);
    expect(snapper.snapshotCount).toBe(0);
    expect(snapper.opsSinceSnapshot).toBe(0);
    expect(snapper.getLastSnapshot()).toBeNull();
  });

  test('uses config defaults from STORAGE', () => {
    const defaultSnapper = new Snapshotter();
    expect(defaultSnapper.snapshotInterval).toBe(10);
  });

  // ── Ingestion ──────────────────────────────────────────────

  test('ingests a rumor operation', () => {
    snapper.ingest(makeRumorOp('r1', 'Test rumor', 'nul1'));
    expect(snapper.getRumor('r1')).toBeTruthy();
    expect(snapper.getRumor('r1').text).toBe('Test rumor');
  });

  test('ingests a vote operation', () => {
    snapper.ingest(makeRumorOp('r1', 'Rumor', 'nul1'));
    snapper.ingest(makeVoteOp('r1', 'voter1', 'TRUE'));
    const votes = snapper.getVotesForRumor('r1');
    expect(votes).toHaveLength(1);
    expect(votes[0].vote).toBe('TRUE');
  });

  test('ingests a join operation and sets initial reputation', () => {
    snapper.ingest(makeJoinOp('user1'));
    expect(snapper.getReputation('user1')).toBe(10);
  });

  test('rejects operations with missing type', () => {
    expect(() => snapper.ingest({})).toThrow('E100');
    expect(() => snapper.ingest(null)).toThrow('E100');
  });

  test('tracks operations since last snapshot', () => {
    snapper.ingest(makeRumorOp('r1', 'Test', 'nul1'));
    snapper.ingest(makeRumorOp('r2', 'Test2', 'nul2'));
    expect(snapper.opsSinceSnapshot).toBe(2);
  });

  // ── Automatic Snapshot Trigger ─────────────────────────────

  test('auto-triggers snapshot at interval', () => {
    const snapshots = [];
    snapper.on('snapshot', snap => snapshots.push(snap));

    for (let i = 0; i < 5; i++) {
      snapper.ingest(makeRumorOp(`r${i}`, `Rumor ${i}`, `nul${i}`));
    }

    expect(snapshots).toHaveLength(1);
    expect(snapper.snapshotCount).toBe(1);
    expect(snapper.opsSinceSnapshot).toBe(0);
  });

  test('returns snapshot object when triggered, null otherwise', () => {
    for (let i = 0; i < 4; i++) {
      const result = snapper.ingest(makeRumorOp(`r${i}`, `Rumor ${i}`, `nul${i}`));
      expect(result).toBeNull();
    }
    const result = snapper.ingest(makeRumorOp('r4', 'Rumor 4', 'nul4'));
    expect(result).not.toBeNull();
    expect(result.activeRumors).toBe(5);
  });

  // ── Tombstone Handling ─────────────────────────────────────

  test('tombstoned rumors are excluded from active rumors', () => {
    snapper.ingest(makeRumorOp('r1', 'Good rumor', 'nul1'));
    snapper.ingest(makeRumorOp('r2', 'Bad rumor', 'nul2'));
    snapper.ingest(makeTombstoneOp('r2', 'nul2'));

    expect(snapper.getRumor('r1')).toBeTruthy();
    expect(snapper.getRumor('r2')).toBeNull();
    expect(snapper.isTombstoned('r2')).toBe(true);
  });

  test('votes for tombstoned rumors are removed', () => {
    snapper.ingest(makeRumorOp('r1', 'Rumor', 'nul1'));
    snapper.ingest(makeVoteOp('r1', 'voter1', 'TRUE'));
    snapper.ingest(makeTombstoneOp('r1', 'nul1'));

    const votes = snapper.getVotesForRumor('r1');
    expect(votes).toHaveLength(0);
  });

  test('tombstoned rumor has zero influence after rebuild', () => {
    snapper.ingest(makeRumorOp('r1', 'Rumor 1', 'nul1'));
    snapper.ingest(makeVoteOp('r1', 'v1', 'TRUE'));
    snapper.ingest(makeRumorOp('r2', 'Rumor 2', 'nul2'));
    snapper.ingest(makeVoteOp('r2', 'v2', 'FALSE'));
    snapper.ingest(makeTombstoneOp('r1', 'nul1'));

    // Force rebuild
    const snapshot = snapper.rebuild();

    expect(snapshot.activeRumors).toBe(1);
    expect(snapshot.tombstonedRumors).toBe(1);
    expect(snapshot.state.rumors.has('r1')).toBe(false);
    expect(snapshot.state.rumors.has('r2')).toBe(true);
    expect(snapshot.state.votes.has('r1')).toBe(false);
    expect(snapshot.state.votes.has('r2')).toBe(true);
  });

  // ── Rebuild ────────────────────────────────────────────────

  test('rebuild reconstructs full state from OpLog', () => {
    snapper.ingest(makeJoinOp('u1'));
    snapper.ingest(makeJoinOp('u2'));
    snapper.ingest(makeRumorOp('r1', 'Test', 'u1'));
    snapper.ingest(makeVoteOp('r1', 'u2', 'TRUE'));

    const snapshot = snapper.rebuild();

    expect(snapshot.activeRumors).toBe(1);
    expect(snapshot.totalVotes).toBe(1);
    expect(snapshot.registeredUsers).toBe(2);
    expect(snapshot.opLogLength).toBe(4);
  });

  test('rebuild is idempotent', () => {
    snapper.ingest(makeRumorOp('r1', 'Test', 'nul1'));
    snapper.ingest(makeVoteOp('r1', 'v1', 'TRUE'));

    const snap1 = snapper.rebuild();
    const snap2 = snapper.rebuild();

    expect(snap1.activeRumors).toBe(snap2.activeRumors);
    expect(snap1.totalVotes).toBe(snap2.totalVotes);
  });

  // ── Batch Ingestion ────────────────────────────────────────

  test('ingestBatch processes multiple operations', () => {
    const ops = [
      makeJoinOp('u1'),
      makeJoinOp('u2'),
      makeRumorOp('r1', 'Batch rumor', 'u1'),
      makeVoteOp('r1', 'u2', 'TRUE'),
    ];

    snapper.ingestBatch(ops);
    expect(snapper.getRumor('r1')).toBeTruthy();
    expect(snapper.getVotesForRumor('r1')).toHaveLength(1);
    expect(snapper.getReputation('u1')).toBe(10);
  });

  // ── Export / Import ────────────────────────────────────────

  test('export and import preserves state', () => {
    snapper.ingest(makeJoinOp('u1'));
    snapper.ingest(makeRumorOp('r1', 'Test', 'u1'));
    snapper.ingest(makeVoteOp('r1', 'u1', 'TRUE'));
    snapper.rebuild();

    const exported = snapper.export();

    const snapper2 = new Snapshotter({ snapshotInterval: 5 });
    snapper2.import(exported);

    expect(snapper2.getRumor('r1')).toBeTruthy();
    expect(snapper2.getVotesForRumor('r1')).toHaveLength(1);
    expect(snapper2.getReputation('u1')).toBe(10);
  });

  // ── getActiveRumors / getOpLog ─────────────────────────────

  test('getActiveRumors returns only non-tombstoned', () => {
    snapper.ingest(makeRumorOp('r1', 'Keep', 'nul1'));
    snapper.ingest(makeRumorOp('r2', 'Remove', 'nul2'));
    snapper.ingest(makeTombstoneOp('r2', 'nul2'));

    const active = snapper.getActiveRumors();
    expect(active.size).toBe(1);
    expect(active.has('r1')).toBe(true);
  });

  test('getOpLog returns all operations including tombstones', () => {
    snapper.ingest(makeRumorOp('r1', 'Test', 'nul1'));
    snapper.ingest(makeTombstoneOp('r1', 'nul1'));
    const opLog = snapper.getOpLog();
    expect(opLog).toHaveLength(2);
  });

  test('setReputation updates and clamps score', () => {
    snapper.ingest(makeJoinOp('u1'));
    snapper.setReputation('u1', 500);
    expect(snapper.getReputation('u1')).toBe(500);

    snapper.setReputation('u1', -10);
    expect(snapper.getReputation('u1')).toBe(0);

    snapper.setReputation('u1', 2000);
    expect(snapper.getReputation('u1')).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. TOMBSTONE MANAGER TESTS
// ═══════════════════════════════════════════════════════════════

describe('TombstoneManager', () => {
  let tm;

  beforeEach(() => {
    tm = new TombstoneManager();
  });

  // ── Rumor Registration ─────────────────────────────────────

  test('registers a rumor author', () => {
    tm.registerRumor('r1', 'author1');
    // No error means success; we test it via createTombstone
  });

  test('rejects registration without required fields', () => {
    expect(() => tm.registerRumor(null, 'a')).toThrow('E200');
    expect(() => tm.registerRumor('r1', null)).toThrow('E200');
  });

  // ── Tombstone Creation ─────────────────────────────────────

  test('creates a tombstone for a rumor by its author', () => {
    tm.registerRumor('r1', 'author1');
    const ts = tm.createTombstone({
      rumorId: 'r1',
      authorNullifier: 'author1',
      reason: 'mistake',
    });

    expect(ts.type).toBe('TOMBSTONE');
    expect(ts.payload.rumorId).toBe('r1');
    expect(ts.payload.reason).toBe('mistake');
    expect(tm.isTombstoned('r1')).toBe(true);
  });

  test('rejects tombstone from non-author', () => {
    tm.registerRumor('r1', 'author1');
    expect(() => tm.createTombstone({
      rumorId: 'r1',
      authorNullifier: 'someone_else',
    })).toThrow('E205');
  });

  test('rejects tombstone for already tombstoned rumor', () => {
    tm.registerRumor('r1', 'author1');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'author1' });

    expect(() => tm.createTombstone({
      rumorId: 'r1',
      authorNullifier: 'author1',
    })).toThrow('E203');
  });

  test('rejects tombstone for unknown rumor', () => {
    expect(() => tm.createTombstone({
      rumorId: 'unknown',
      authorNullifier: 'a',
    })).toThrow('E204');
  });

  test('rejects tombstone without rumorId', () => {
    expect(() => tm.createTombstone({
      authorNullifier: 'a',
    })).toThrow('E201');
  });

  test('rejects tombstone without authorNullifier', () => {
    expect(() => tm.createTombstone({
      rumorId: 'r1',
    })).toThrow('E202');
  });

  // ── Vote Validation ────────────────────────────────────────

  test('validates vote on active rumor', () => {
    const result = tm.validateVote('r1');
    expect(result.valid).toBe(true);
  });

  test('rejects vote on tombstoned rumor', () => {
    tm.registerRumor('r1', 'author1');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'author1' });

    const result = tm.validateVote('r1');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('E010');
  });

  // ── Filtering ──────────────────────────────────────────────

  test('filterActive removes tombstoned rumors', () => {
    tm.registerRumor('r1', 'a1');
    tm.registerRumor('r2', 'a2');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'a1' });

    const rumors = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
    const active = tm.filterActive(rumors);
    expect(active).toHaveLength(2);
    expect(active.map(r => r.id)).toEqual(['r2', 'r3']);
  });

  test('filterActiveVotes removes votes for tombstoned rumors', () => {
    tm.registerRumor('r1', 'a1');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'a1' });

    const voteMap = new Map([
      ['r1', [{ nullifier: 'v1' }]],
      ['r2', [{ nullifier: 'v2' }]],
    ]);

    const filtered = tm.filterActiveVotes(voteMap);
    expect(filtered.size).toBe(1);
    expect(filtered.has('r1')).toBe(false);
    expect(filtered.has('r2')).toBe(true);
  });

  // ── Queries ────────────────────────────────────────────────

  test('getTombstone returns metadata', () => {
    tm.registerRumor('r1', 'a1');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'a1', reason: 'test' });

    const meta = tm.getTombstone('r1');
    expect(meta).toBeTruthy();
    expect(meta.reason).toBe('test');
  });

  test('getTombstonedIds returns all tombstoned IDs', () => {
    tm.registerRumor('r1', 'a1');
    tm.registerRumor('r2', 'a2');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'a1' });
    tm.createTombstone({ rumorId: 'r2', authorNullifier: 'a2' });

    const ids = tm.getTombstonedIds();
    expect(ids.size).toBe(2);
    expect(ids.has('r1')).toBe(true);
    expect(ids.has('r2')).toBe(true);
  });

  test('tombstoneCount tracks correctly', () => {
    expect(tm.tombstoneCount).toBe(0);
    tm.registerRumor('r1', 'a1');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'a1' });
    expect(tm.tombstoneCount).toBe(1);
  });

  // ── Events ─────────────────────────────────────────────────

  test('emits tombstone event', () => {
    const events = [];
    tm.on('tombstone', t => events.push(t));

    tm.registerRumor('r1', 'a1');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'a1' });

    expect(events).toHaveLength(1);
    expect(events[0].payload.rumorId).toBe('r1');
  });

  // ── Export / Import ────────────────────────────────────────

  test('export and import preserves tombstones', () => {
    tm.registerRumor('r1', 'a1');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'a1' });

    const exported = tm.export();

    const tm2 = new TombstoneManager();
    tm2.import(exported);

    expect(tm2.isTombstoned('r1')).toBe(true);
    expect(tm2.tombstoneCount).toBe(1);
  });

  test('clear resets all state', () => {
    tm.registerRumor('r1', 'a1');
    tm.createTombstone({ rumorId: 'r1', authorNullifier: 'a1' });
    tm.clear();

    expect(tm.tombstoneCount).toBe(0);
    expect(tm.isTombstoned('r1')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. TRUST PROPAGATOR TESTS
// ═══════════════════════════════════════════════════════════════

describe('TrustPropagator', () => {
  let tp;

  beforeEach(() => {
    tp = new TrustPropagator(0.85, 100, 1e-6);
  });

  // ── Construction ───────────────────────────────────────────

  test('initializes with correct defaults', () => {
    expect(tp.dampingFactor).toBe(0.85);
    expect(tp.maxIterations).toBe(100);
    expect(tp.tolerance).toBe(1e-6);
  });

  // ── Graph Construction ─────────────────────────────────────

  test('builds empty graph from empty history', () => {
    const graph = tp.buildGraph(new Map(), new Map());
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges.size).toBe(0);
  });

  test('builds graph from co-correct voters', () => {
    const voteHistory = new Map([
      ['rumor1', [
        { nullifier: 'A', vote: 'TRUE' },
        { nullifier: 'B', vote: 'TRUE' },
        { nullifier: 'C', vote: 'FALSE' },
      ]],
    ]);

    const scoreHistory = new Map([
      ['rumor1', {
        consensus: 'TRUE',
        voterScores: new Map([['A', 1.5], ['B', 0.8], ['C', -0.3]]),
      }],
    ]);

    const graph = tp.buildGraph(voteHistory, scoreHistory);

    expect(graph.nodes.size).toBe(3);
    // A and B co-correct → edge between them
    expect(graph.edges.has('A')).toBe(true);
    expect(graph.edges.get('A').has('B')).toBe(true);
    expect(graph.edges.get('B').has('A')).toBe(true);
    // C voted incorrectly → no edges from C to A or B through co-correct
  });

  test('builds edges from multiple rumors', () => {
    const voteHistory = new Map([
      ['r1', [
        { nullifier: 'A', vote: 'TRUE' },
        { nullifier: 'B', vote: 'TRUE' },
      ]],
      ['r2', [
        { nullifier: 'B', vote: 'FALSE' },
        { nullifier: 'C', vote: 'FALSE' },
      ]],
    ]);

    const scoreHistory = new Map([
      ['r1', { consensus: 'TRUE', voterScores: new Map([['A', 1.0], ['B', 1.0]]) }],
      ['r2', { consensus: 'FALSE', voterScores: new Map([['B', 0.5], ['C', 0.5]]) }],
    ]);

    const graph = tp.buildGraph(voteHistory, scoreHistory);
    expect(graph.nodes.has('A')).toBe(true);
    expect(graph.nodes.has('B')).toBe(true);
    expect(graph.nodes.has('C')).toBe(true);
    expect(graph.edges.get('A').has('B')).toBe(true);
    expect(graph.edges.get('B').has('C')).toBe(true);
  });

  test('skips disputed/unverified consensus rumors', () => {
    const voteHistory = new Map([
      ['r1', [
        { nullifier: 'A', vote: 'TRUE' },
        { nullifier: 'B', vote: 'FALSE' },
      ]],
    ]);

    const scoreHistory = new Map([
      ['r1', { consensus: 'DISPUTED', voterScores: new Map() }],
    ]);

    const graph = tp.buildGraph(voteHistory, scoreHistory);
    expect(graph.edges.size).toBe(0);
  });

  // ── PPR Computation ────────────────────────────────────────

  test('computes PPR on empty graph', () => {
    const graph = { nodes: new Set(), edges: new Map(), outDegree: new Map() };
    const result = tp.computePPR(graph);
    expect(result.scores.size).toBe(0);
    expect(result.converged).toBe(true);
  });

  test('computes uniform PPR without trust seeds', () => {
    const voteHistory = new Map([
      ['r1', [
        { nullifier: 'A', vote: 'TRUE' },
        { nullifier: 'B', vote: 'TRUE' },
        { nullifier: 'C', vote: 'TRUE' },
      ]],
    ]);

    const scoreHistory = new Map([
      ['r1', { consensus: 'TRUE', voterScores: new Map([['A', 1], ['B', 1], ['C', 1]]) }],
    ]);

    const graph = tp.buildGraph(voteHistory, scoreHistory);
    const result = tp.computePPR(graph);

    expect(result.scores.size).toBe(3);
    expect(result.converged).toBe(true);

    // With uniform seeds and symmetric graph, all should be roughly equal
    const scores = [...result.scores.values()];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    for (const s of scores) {
      expect(Math.abs(s - avg)).toBeLessThan(0.05);
    }
  });

  test('PPR with custom trust seeds biases scores', () => {
    const voteHistory = new Map([
      ['r1', [
        { nullifier: 'A', vote: 'TRUE' },
        { nullifier: 'B', vote: 'TRUE' },
        { nullifier: 'C', vote: 'TRUE' },
      ]],
    ]);

    const scoreHistory = new Map([
      ['r1', { consensus: 'TRUE', voterScores: new Map([['A', 1], ['B', 1], ['C', 1]]) }],
    ]);

    const graph = tp.buildGraph(voteHistory, scoreHistory);

    // Trust A heavily, ignore B and C
    const seeds = new Map([['A', 1.0], ['B', 0], ['C', 0]]);
    const result = tp.computePPR(graph, seeds);

    expect(result.scores.get('A')).toBeGreaterThan(result.scores.get('B'));
    expect(result.scores.get('A')).toBeGreaterThan(result.scores.get('C'));
  });

  test('PPR converges within max iterations', () => {
    const voteHistory = new Map();
    const scoreHistory = new Map();

    // Create a larger graph
    for (let r = 0; r < 10; r++) {
      const votes = [];
      for (let v = 0; v < 5; v++) {
        votes.push({ nullifier: `v${v}`, vote: 'TRUE' });
      }
      voteHistory.set(`r${r}`, votes);
      scoreHistory.set(`r${r}`, {
        consensus: 'TRUE',
        voterScores: new Map(votes.map(v => [v.nullifier, 1.0])),
      });
    }

    const graph = tp.buildGraph(voteHistory, scoreHistory);
    const result = tp.computePPR(graph);

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(100);
  });

  // ── Rumor Trust Score ──────────────────────────────────────

  test('getRumorTrust weights by PPR scores', () => {
    const pprScores = new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]]);
    const votes = [
      { nullifier: 'A', vote: 'TRUE' },
      { nullifier: 'B', vote: 'TRUE' },
      { nullifier: 'C', vote: 'FALSE' },
    ];

    const trust = tp.getRumorTrust('r1', pprScores, votes);
    // A(0.5) + B(0.3) = 0.8 TRUE weight, total = 1.0
    expect(trust).toBe(80);
  });

  test('getRumorTrust returns 50 for empty votes', () => {
    const trust = tp.getRumorTrust('r1', new Map(), []);
    expect(trust).toBe(50);
  });

  test('getRumorTrustBatch scores multiple rumors', () => {
    const pprScores = new Map([['A', 0.6], ['B', 0.4]]);
    const votesByRumor = new Map([
      ['r1', [{ nullifier: 'A', vote: 'TRUE' }, { nullifier: 'B', vote: 'FALSE' }]],
      ['r2', [{ nullifier: 'A', vote: 'FALSE' }, { nullifier: 'B', vote: 'TRUE' }]],
    ]);

    const results = tp.getRumorTrustBatch(pprScores, votesByRumor);
    expect(results.size).toBe(2);
    expect(results.get('r1')).toBe(60); // A=TRUE with 0.6 weight
    expect(results.get('r2')).toBe(40); // B=TRUE with 0.4 weight
  });

  // ── Graph Analysis ─────────────────────────────────────────

  test('getTopTrusted returns ranked voters', () => {
    const pprScores = new Map([['A', 0.5], ['B', 0.3], ['C', 0.2]]);
    const top = tp.getTopTrusted(pprScores, 2);

    expect(top).toHaveLength(2);
    expect(top[0].nullifier).toBe('A');
    expect(top[1].nullifier).toBe('B');
  });

  test('getGraphStats returns correct statistics', () => {
    const voteHistory = new Map([
      ['r1', [
        { nullifier: 'A', vote: 'TRUE' },
        { nullifier: 'B', vote: 'TRUE' },
      ]],
    ]);

    const scoreHistory = new Map([
      ['r1', { consensus: 'TRUE', voterScores: new Map([['A', 1], ['B', 1]]) }],
    ]);

    const graph = tp.buildGraph(voteHistory, scoreHistory);
    const stats = tp.getGraphStats(graph);

    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(2); // bidirectional
    expect(stats.avgDegree).toBe(1);
    expect(stats.density).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. ANTI-ENTROPY SYNC TESTS
// ═══════════════════════════════════════════════════════════════

describe('AntiEntropySync', () => {
  let sync;

  beforeEach(() => {
    sync = new AntiEntropySync({ syncCooldown: 100 });
  });

  // ── Merkle Root ────────────────────────────────────────────

  test('computes Merkle root for empty entries', () => {
    const root = sync.computeMerkleRoot([]);
    expect(root).toBeTruthy();
    expect(typeof root).toBe('string');
    expect(root.length).toBe(64); // SHA-256 hex
  });

  test('same entries produce same root', () => {
    const entries = [{ a: 1 }, { b: 2 }];
    const r1 = sync.computeMerkleRoot(entries);
    const r2 = sync.computeMerkleRoot(entries);
    expect(r1).toBe(r2);
  });

  test('different entries produce different roots', () => {
    const r1 = sync.computeMerkleRoot([{ a: 1 }]);
    const r2 = sync.computeMerkleRoot([{ a: 2 }]);
    expect(r1).not.toBe(r2);
  });

  test('order matters for Merkle root', () => {
    const r1 = sync.computeMerkleRoot([{ a: 1 }, { b: 2 }]);
    const r2 = sync.computeMerkleRoot([{ b: 2 }, { a: 1 }]);
    expect(r1).not.toBe(r2);
  });

  test('handles odd number of entries', () => {
    const root = sync.computeMerkleRoot([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(root).toBeTruthy();
    expect(root.length).toBe(64);
  });

  // ── Local Root Management ──────────────────────────────────

  test('updateLocalRoot stores root for a store', () => {
    const entries = [{ id: 1 }, { id: 2 }];
    const root = sync.updateLocalRoot('rumors', entries);

    expect(root).toBeTruthy();
    expect(sync.getLocalRoot('rumors')).toBe(root);
  });

  test('getAllLocalRoots returns all roots', () => {
    sync.updateLocalRoot('rumors', [{ a: 1 }]);
    sync.updateLocalRoot('votes', [{ b: 2 }]);

    const roots = sync.getAllLocalRoots();
    expect(roots.size).toBe(2);
    expect(roots.has('rumors')).toBe(true);
    expect(roots.has('votes')).toBe(true);
  });

  // ── Sync Request/Response ──────────────────────────────────

  test('creates sync request with local roots', () => {
    sync.updateLocalRoot('rumors', [{ a: 1 }]);
    const request = sync.createSyncRequest('peer1');

    expect(request).toBeTruthy();
    expect(request.type).toBe('SYNC_REQUEST');
    expect(request.payload.roots.rumors).toBeTruthy();
  });

  test('respects cooldown for sync requests', async () => {
    sync.updateLocalRoot('rumors', [{ a: 1 }]);
    const r1 = sync.createSyncRequest('peer1');
    expect(r1).toBeTruthy();

    // Simulate receiving a response (sets lastSync)
    sync._lastSync.set('peer1', Date.now());

    const r2 = sync.createSyncRequest('peer1');
    expect(r2).toBeNull(); // cooldown not elapsed

    // Wait for cooldown
    await new Promise(r => setTimeout(r, 150));
    const r3 = sync.createSyncRequest('peer1');
    expect(r3).toBeTruthy();
  });

  test('handleSyncRequest detects out-of-sync stores', () => {
    sync.updateLocalRoot('rumors', [{ a: 1 }, { b: 2 }]);
    sync.updateLocalRoot('votes', [{ c: 3 }]);

    const peerRequest = {
      type: 'SYNC_REQUEST',
      payload: {
        roots: {
          rumors: 'different_root_hash',
          votes: sync.getLocalRoot('votes'), // same root
        },
      },
    };

    const localData = new Map([
      ['rumors', [{ a: 1 }, { b: 2 }]],
      ['votes', [{ c: 3 }]],
    ]);

    const { response, diff } = sync.handleSyncRequest(peerRequest, localData);

    expect(response.type).toBe('SYNC_RESPONSE');
    expect(diff.storesOutOfSync).toContain('rumors');
    expect(diff.storesOutOfSync).not.toContain('votes');
    expect(diff.entriesToSend.rumors).toHaveLength(2);
  });

  test('handleSyncRequest rejects invalid request', () => {
    expect(() => sync.handleSyncRequest(null, new Map())).toThrow('E300');
    expect(() => sync.handleSyncRequest({}, new Map())).toThrow('E300');
  });

  test('handleSyncResponse tracks stats', () => {
    const response = {
      type: 'SYNC_RESPONSE',
      payload: {
        missingEntries: {
          rumors: [{ id: 'r1' }, { id: 'r2' }],
          votes: [{ id: 'v1' }],
        },
        storesOutOfSync: ['rumors', 'votes'],
      },
    };

    const result = sync.handleSyncResponse(response, 'peer1');

    expect(result.applied).toBe(3);
    expect(result.storesUpdated).toContain('rumors');
    expect(result.storesUpdated).toContain('votes');

    const stats = sync.getStats();
    expect(stats.syncCount).toBe(1);
    expect(stats.entriesReceived).toBe(3);
  });

  test('handleSyncResponse rejects invalid response', () => {
    expect(() => sync.handleSyncResponse(null, 'p')).toThrow('E301');
  });

  // ── Read Repair ────────────────────────────────────────────

  test('readRepair merges new entries', () => {
    const local = [{ id: 1 }, { id: 2 }];
    const received = [{ id: 2 }, { id: 3 }]; // id:2 is duplicate

    const result = sync.readRepair('rumors', local, received);

    expect(result.newEntries).toBe(1); // only id:3 is new
    expect(result.merged).toHaveLength(3);
  });

  test('readRepair handles empty received', () => {
    const local = [{ id: 1 }];
    const result = sync.readRepair('rumors', local, []);
    expect(result.newEntries).toBe(0);
    expect(result.merged).toHaveLength(1);
  });

  test('readRepair updates local root after merge', () => {
    const local = [{ id: 1 }];
    const received = [{ id: 2 }];

    sync.updateLocalRoot('rumors', local);
    const oldRoot = sync.getLocalRoot('rumors');

    sync.readRepair('rumors', local, received);
    const newRoot = sync.getLocalRoot('rumors');

    expect(newRoot).not.toBe(oldRoot);
  });

  test('readRepair emits event', () => {
    const events = [];
    sync.on('read-repair', e => events.push(e));

    sync.readRepair('rumors', [{ id: 1 }], [{ id: 2 }]);

    expect(events).toHaveLength(1);
    expect(events[0].storeKey).toBe('rumors');
    expect(events[0].newEntries).toBe(1);
  });

  // ── canSync ────────────────────────────────────────────────

  test('canSync respects cooldown', () => {
    expect(sync.canSync('peer1')).toBe(true);

    sync._lastSync.set('peer1', Date.now());
    expect(sync.canSync('peer1')).toBe(false);
  });

  // ── Reset ──────────────────────────────────────────────────

  test('reset clears all state', () => {
    sync.updateLocalRoot('rumors', [{ id: 1 }]);
    sync._syncCount = 5;
    sync._entriesReceived = 10;

    sync.reset();

    expect(sync.getStats().syncCount).toBe(0);
    expect(sync.getStats().entriesReceived).toBe(0);
    expect(sync.getAllLocalRoots().size).toBe(0);
  });

  test('resetCooldown clears cooldown for specific peer', () => {
    sync._lastSync.set('peer1', Date.now());
    expect(sync.canSync('peer1')).toBe(false);

    sync.resetCooldown('peer1');
    expect(sync.canSync('peer1')).toBe(true);
  });

  // ── Full Sync Flow ─────────────────────────────────────────

  test('full sync flow between two nodes', () => {
    // Node A has data
    const nodeA = new AntiEntropySync({ syncCooldown: 0 });
    const nodeAData = new Map([
      ['rumors', [{ id: 'r1', text: 'Hello' }, { id: 'r2', text: 'World' }]],
      ['votes', [{ id: 'v1', rumorId: 'r1', vote: 'TRUE' }]],
    ]);
    nodeA.updateLocalRoot('rumors', nodeAData.get('rumors'));
    nodeA.updateLocalRoot('votes', nodeAData.get('votes'));

    // Node B has different/less data
    const nodeB = new AntiEntropySync({ syncCooldown: 0 });
    const nodeBData = new Map([
      ['rumors', [{ id: 'r1', text: 'Hello' }]], // missing r2
      ['votes', []], // no votes
    ]);
    nodeB.updateLocalRoot('rumors', nodeBData.get('rumors'));
    nodeB.updateLocalRoot('votes', nodeBData.get('votes'));

    // B sends sync request to A
    const request = nodeB.createSyncRequest('nodeA');
    expect(request).toBeTruthy();

    // A handles request and produces response
    const { response, diff } = nodeA.handleSyncRequest(request, nodeAData);
    expect(diff.storesOutOfSync.length).toBeGreaterThan(0);

    // B handles response
    const entriesReceived = [];
    nodeB.on('entries-received', e => entriesReceived.push(e));
    const result = nodeB.handleSyncResponse(response, 'nodeA');
    expect(result.applied).toBeGreaterThan(0);
    expect(entriesReceived.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. INTEGRATION TEST — Full Pipeline
// ═══════════════════════════════════════════════════════════════

describe('Integration: Full Pipeline', () => {
  let snapshotter;
  let tombstoneManager;
  let correlationDampener;
  let btsEngine;
  let rbtsEngine;
  let reputationManager;
  let trustPropagator;

  beforeEach(() => {
    snapshotter = new Snapshotter({ snapshotInterval: 50 });
    tombstoneManager = new TombstoneManager();
    correlationDampener = new CorrelationDampener();
    btsEngine = new BTSEngine();
    rbtsEngine = new RBTSEngine();
    reputationManager = new ReputationManager();
    trustPropagator = new TrustPropagator();
  });

  test('full lifecycle: join → post → vote → score → delete → rescore', () => {
    // ── 1. Users join ────────────────────────────────────────
    const users = ['alice', 'bob', 'charlie', 'dave', 'eve'];
    for (const u of users) {
      snapshotter.ingest(makeJoinOp(u));
      reputationManager.register(u);
    }
    expect(reputationManager.userCount).toBe(5);

    // ── 2. Alice posts a rumor ───────────────────────────────
    const rumorOp = makeRumorOp('rumor1', 'Dean cancelling Friday classes', 'alice');
    snapshotter.ingest(rumorOp);
    tombstoneManager.registerRumor('rumor1', 'alice');

    expect(snapshotter.getRumor('rumor1')).toBeTruthy();

    // ── 3. Everyone votes ────────────────────────────────────
    const votes = [
      { nullifier: 'bob', vote: 'TRUE', prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 } },
      { nullifier: 'charlie', vote: 'TRUE', prediction: { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 } },
      { nullifier: 'dave', vote: 'FALSE', prediction: { TRUE: 0.4, FALSE: 0.5, UNVERIFIED: 0.1 } },
      { nullifier: 'eve', vote: 'TRUE', prediction: { TRUE: 0.8, FALSE: 0.1, UNVERIFIED: 0.1 } },
    ];

    for (const v of votes) {
      const voteOp = makeVoteOp('rumor1', v.nullifier, v.vote, v.prediction);
      snapshotter.ingest(voteOp);
    }

    // ── 4. Run correlation dampening ─────────────────────────
    const rawVotes = votes.map(v => ({
      nullifier: v.nullifier,
      vote: v.vote,
      prediction: v.prediction,
      stakeAmount: 1,
    }));

    const dampenedVotes = correlationDampener.dampen(rawVotes, new Map());
    expect(dampenedVotes).toHaveLength(4);
    // No history → all weights should be 1.0
    for (const dv of dampenedVotes) {
      expect(dv.weight).toBe(1.0);
    }

    // ── 5. Score with RBTS (N < 30) ──────────────────────────
    const btsResult = rbtsEngine.calculate(dampenedVotes, 'rumor1', 1);
    expect(btsResult.voterScores.size).toBe(4);
    expect(btsResult.consensus).toBe('TRUE'); // 3 TRUE vs 1 FALSE
    expect(btsResult.rumorTrustScore).toBeGreaterThan(50);

    // ── 6. Apply scores to reputation ────────────────────────
    const { rewards, slashes } = reputationManager.applyScores(btsResult, 'rumor1');
    expect(rewards.size + slashes.size).toBeGreaterThan(0);

    // Honest voters (with consensus) should generally be rewarded
    // Dave voted FALSE against TRUE consensus — may be slashed

    // ── 7. Build trust graph and compute PPR ─────────────────
    const voteHistory = new Map([
      ['rumor1', votes.map(v => ({ nullifier: v.nullifier, vote: v.vote }))],
    ]);
    const scoreHistory = new Map([
      ['rumor1', btsResult],
    ]);

    const graph = trustPropagator.buildGraph(voteHistory, scoreHistory);
    const pprResult = trustPropagator.computePPR(graph);
    expect(pprResult.converged).toBe(true);
    expect(pprResult.scores.size).toBeGreaterThan(0);

    // PPR trust score for the rumor
    const pprTrust = trustPropagator.getRumorTrust(
      'rumor1',
      pprResult.scores,
      votes.map(v => ({ nullifier: v.nullifier, vote: v.vote }))
    );
    expect(pprTrust).toBeGreaterThan(0);
    expect(pprTrust).toBeLessThanOrEqual(100);

    // ── 8. Alice deletes her rumor ───────────────────────────
    const tombstone = tombstoneManager.createTombstone({
      rumorId: 'rumor1',
      authorNullifier: 'alice',
      reason: 'false_alarm',
    });
    expect(tombstone.type).toBe('TOMBSTONE');

    // Ingest tombstone into snapshotter
    snapshotter.ingest(makeTombstoneOp('rumor1', 'alice'));

    // ── 9. Verify rumor has zero influence ───────────────────
    expect(snapshotter.getRumor('rumor1')).toBeNull();
    expect(snapshotter.getVotesForRumor('rumor1')).toHaveLength(0);
    expect(snapshotter.isTombstoned('rumor1')).toBe(true);
    expect(tombstoneManager.isTombstoned('rumor1')).toBe(true);

    // Votes on tombstoned rumor should be rejected
    const voteCheck = tombstoneManager.validateVote('rumor1');
    expect(voteCheck.valid).toBe(false);

    // ── 10. Rebuild snapshot — tombstone is respected ─────────
    const snapshot = snapshotter.rebuild();
    expect(snapshot.activeRumors).toBe(0);
    expect(snapshot.tombstonedRumors).toBe(1);
    expect(snapshot.state.rumors.has('rumor1')).toBe(false);
    expect(snapshot.state.votes.has('rumor1')).toBe(false);
  });

  test('scoring pipeline with BTS (N ≥ 30)', () => {
    // Create 35 voters
    const voters = [];
    for (let i = 0; i < 35; i++) {
      const nul = `voter${i}`;
      voters.push(nul);
      reputationManager.register(nul);
    }

    // Generate votes: 25 TRUE, 10 FALSE
    const rawVotes = voters.map((nul, i) => ({
      nullifier: nul,
      vote: i < 25 ? 'TRUE' : 'FALSE',
      prediction: i < 25
        ? { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }
        : { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 },
      stakeAmount: 1,
    }));

    // Dampen
    const dampened = correlationDampener.dampen(rawVotes, new Map());
    expect(dampened).toHaveLength(35);

    // Score with BTS (N >= 30)
    const result = btsEngine.calculate(dampened);
    expect(result.voterScores.size).toBe(35);
    expect(result.consensus).toBe('TRUE');
    expect(result.rumorTrustScore).toBeGreaterThan(60);

    // Apply scores
    const { rewards, slashes } = reputationManager.applyScores(result, 'big_rumor');
    expect(rewards.size + slashes.size).toBe(35);
  });

  test('correlation dampening reduces bot influence', () => {
    // Create vote history showing 10 accounts voting identically across 5 rumors
    const bots = Array.from({ length: 10 }, (_, i) => `bot${i}`);
    const honestVoters = ['honest1', 'honest2', 'honest3'];

    const voteHistory = new Map();

    // Bots all vote TRUE on every rumor — zero variance, lockstep
    for (const nul of bots) {
      voteHistory.set(nul, [
        { rumorId: 'prev_r0', vote: 'TRUE' },
        { rumorId: 'prev_r1', vote: 'TRUE' },
        { rumorId: 'prev_r2', vote: 'TRUE' },
        { rumorId: 'prev_r3', vote: 'TRUE' },
        { rumorId: 'prev_r4', vote: 'TRUE' },
      ]);
    }

    // Honest voters have diverse, independent patterns
    const honestPatterns = [
      ['TRUE', 'FALSE', 'TRUE', 'FALSE', 'TRUE'],      // mixed
      ['FALSE', 'TRUE', 'FALSE', 'TRUE', 'FALSE'],     // opposite of above
      ['TRUE', 'TRUE', 'FALSE', 'FALSE', 'UNVERIFIED'], // third pattern
    ];
    for (let i = 0; i < honestVoters.length; i++) {
      voteHistory.set(honestVoters[i], honestPatterns[i].map((v, r) => ({
        rumorId: `prev_r${r}`,
        vote: v,
      })));
    }

    // Current votes
    const rawVotes = [
      ...bots.map(nul => ({
        nullifier: nul,
        vote: 'TRUE',
        prediction: { TRUE: 0.9, FALSE: 0.05, UNVERIFIED: 0.05 },
        stakeAmount: 1,
      })),
      ...honestVoters.map(nul => ({
        nullifier: nul,
        vote: 'FALSE',
        prediction: { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 },
        stakeAmount: 1,
      })),
    ];

    const dampened = correlationDampener.dampen(rawVotes, voteHistory);

    // Bot weights should be < 1.0 (dampened due to correlated voting)
    const botWeights = dampened.filter(dv => dv.vote.nullifier.startsWith('bot'));
    const honestWeights = dampened.filter(dv => dv.vote.nullifier.startsWith('honest'));

    for (const bw of botWeights) {
      expect(bw.weight).toBeLessThan(1.0);
      expect(bw.clusterSize).toBeGreaterThan(1);
    }

    // The effective voting power of all 10 bots combined should be
    // much less than 10 (the dampener is working)
    const totalBotWeight = botWeights.reduce((s, bw) => s + bw.weight, 0);
    expect(totalBotWeight).toBeLessThan(5); // 10 bots → < 5 effective votes

    // Honest voters' weights should also be defined (may be affected
    // by edge-case correlation with constant-variance bots)
    for (const hw of honestWeights) {
      expect(typeof hw.weight).toBe('number');
      expect(hw.weight).toBeGreaterThan(0);
    }
  });

  test('anti-entropy sync reconciles divergent state', () => {
    // Node A: has 2 rumors, 3 votes
    const nodeA = new AntiEntropySync({ syncCooldown: 0 });
    const nodeAData = new Map([
      ['rumors', [
        { id: 'r1', text: 'First rumor' },
        { id: 'r2', text: 'Second rumor' },
      ]],
      ['votes', [
        { id: 'v1', rumorId: 'r1', vote: 'TRUE' },
        { id: 'v2', rumorId: 'r1', vote: 'FALSE' },
        { id: 'v3', rumorId: 'r2', vote: 'TRUE' },
      ]],
    ]);
    nodeA.updateLocalRoot('rumors', nodeAData.get('rumors'));
    nodeA.updateLocalRoot('votes', nodeAData.get('votes'));

    // Node B: has 1 rumor, 1 vote (was offline)
    const nodeB = new AntiEntropySync({ syncCooldown: 0 });
    const nodeBData = new Map([
      ['rumors', [{ id: 'r1', text: 'First rumor' }]],
      ['votes', [{ id: 'v1', rumorId: 'r1', vote: 'TRUE' }]],
    ]);
    nodeB.updateLocalRoot('rumors', nodeBData.get('rumors'));
    nodeB.updateLocalRoot('votes', nodeBData.get('votes'));

    // Sync: B asks A for missing data
    const request = nodeB.createSyncRequest('nodeA');
    const { response } = nodeA.handleSyncRequest(request, nodeAData);
    const result = nodeB.handleSyncResponse(response, 'nodeA');

    // B should have received entries
    expect(result.applied).toBeGreaterThan(0);
    expect(result.storesUpdated.length).toBeGreaterThan(0);

    // Read-repair: merge A's rumors into B's local set
    const { merged, newEntries } = nodeB.readRepair(
      'rumors',
      nodeBData.get('rumors'),
      response.payload.missingEntries.rumors || []
    );

    expect(newEntries).toBeGreaterThan(0);
    expect(merged.length).toBeGreaterThan(nodeBData.get('rumors').length);
  });

  test('reputation survives tombstone-and-rescore cycle', () => {
    // Setup: users, rumor, votes, scoring
    ['u1', 'u2', 'u3', 'u4'].forEach(u => reputationManager.register(u));

    const votes = [
      { nullifier: 'u1', vote: 'TRUE', prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, stakeAmount: 1 },
      { nullifier: 'u2', vote: 'TRUE', prediction: { TRUE: 0.6, FALSE: 0.3, UNVERIFIED: 0.1 }, stakeAmount: 1 },
      { nullifier: 'u3', vote: 'FALSE', prediction: { TRUE: 0.3, FALSE: 0.6, UNVERIFIED: 0.1 }, stakeAmount: 1 },
      { nullifier: 'u4', vote: 'TRUE', prediction: { TRUE: 0.8, FALSE: 0.15, UNVERIFIED: 0.05 }, stakeAmount: 1 },
    ];

    const dampened = correlationDampener.dampen(votes, new Map());
    const bts1 = rbtsEngine.calculate(dampened, 'rumor_x', 1);
    reputationManager.applyScores(bts1, 'rumor_x');

    // Record scores after first scoring
    const scoresAfterFirstScore = new Map();
    for (const u of ['u1', 'u2', 'u3', 'u4']) {
      scoresAfterFirstScore.set(u, reputationManager.getScore(u));
    }

    // Tombstone rumor_x → scores should freeze (no reversal without re-computation)
    tombstoneManager.registerRumor('rumor_x', 'poster');
    tombstoneManager.createTombstone({ rumorId: 'rumor_x', authorNullifier: 'poster', reason: 'retracted' });

    snapshotter.ingest(makeRumorOp('rumor_x', 'test', 'poster'));
    for (const v of votes) {
      snapshotter.ingest(makeVoteOp('rumor_x', v.nullifier, v.vote, v.prediction));
    }
    snapshotter.ingest(makeTombstoneOp('rumor_x', 'poster'));

    // Rebuild — tombstoned rumor should have zero influence on new snapshots
    const snapshot = snapshotter.rebuild();
    expect(snapshot.activeRumors).toBe(0);
    expect(snapshot.state.votes.has('rumor_x')).toBe(false);

    // Reputation manager still has the old scores (they were applied)
    // But the rumor has zero future influence
    for (const u of ['u1', 'u2', 'u3', 'u4']) {
      expect(reputationManager.getScore(u)).toBe(scoresAfterFirstScore.get(u));
    }
  });

  test('snapshotter + tombstone manager work together on multi-rumor scenario', () => {
    // Post 3 rumors, tombstone 1, verify state
    snapshotter.ingest(makeJoinOp('poster'));
    tombstoneManager.registerRumor('r1', 'poster');
    tombstoneManager.registerRumor('r2', 'poster');
    tombstoneManager.registerRumor('r3', 'poster');

    snapshotter.ingest(makeRumorOp('r1', 'Rumor 1', 'poster'));
    snapshotter.ingest(makeRumorOp('r2', 'Rumor 2', 'poster'));
    snapshotter.ingest(makeRumorOp('r3', 'Rumor 3', 'poster'));

    // Vote on all
    snapshotter.ingest(makeVoteOp('r1', 'v1', 'TRUE'));
    snapshotter.ingest(makeVoteOp('r2', 'v2', 'FALSE'));
    snapshotter.ingest(makeVoteOp('r3', 'v3', 'TRUE'));

    // Tombstone r2
    tombstoneManager.createTombstone({ rumorId: 'r2', authorNullifier: 'poster' });
    snapshotter.ingest(makeTombstoneOp('r2', 'poster'));

    // Verify
    expect(snapshotter.getActiveRumors().size).toBe(2);
    expect(snapshotter.getRumor('r2')).toBeNull();
    expect(snapshotter.getVotesForRumor('r2')).toHaveLength(0);
    expect(tombstoneManager.isTombstoned('r2')).toBe(true);
    expect(tombstoneManager.validateVote('r2').valid).toBe(false);
    expect(tombstoneManager.validateVote('r1').valid).toBe(true);

    // Filter rumor list
    const all = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
    const active = tombstoneManager.filterActive(all);
    expect(active).toHaveLength(2);
  });
});
