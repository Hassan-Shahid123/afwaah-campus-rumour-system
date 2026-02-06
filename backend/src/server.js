// ─────────────────────────────────────────────────────────────
// Afwaah — Express API Server
// Wraps all backend classes into REST endpoints for the frontend.
// ─────────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';

// ── Backend modules ──────────────────────────────────────────
import { IdentityManager } from './identity/identity-manager.js';
import { EmailVerifier } from './identity/email-verifier.js';
import { MembershipTree } from './identity/membership-tree.js';
import { BTSEngine } from './scoring/bts-engine.js';
import { RBTSEngine } from './scoring/rbts-engine.js';
import { CorrelationDampener } from './scoring/correlation-dampener.js';
import { ReputationManager } from './scoring/reputation-manager.js';
import { TrustPropagator } from './scoring/trust-propagator.js';
import { Snapshotter } from './state/snapshotter.js';
import { TombstoneManager } from './state/tombstone-manager.js';
import {
  IDENTITY, SCORING, PROTOCOL, NETWORK, STORAGE, MAX_RUMOR_LENGTH,
} from './config.js';

// ── Instantiate singletons ───────────────────────────────────
const identityManager = new IdentityManager();
const emailVerifier = new EmailVerifier();
const membershipTree = new MembershipTree();
const btsEngine = new BTSEngine();
const rbtsEngine = new RBTSEngine();
const correlationDampener = new CorrelationDampener();
const reputationManager = new ReputationManager();
const trustPropagator = new TrustPropagator();
const snapshotter = new Snapshotter();
const tombstoneManager = new TombstoneManager();

// ── Express App ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ╔═══════════════════════════════════════════════════════════╗
// ║  IDENTITY ENDPOINTS                                       ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/identity/create
app.post('/api/identity/create', (req, res) => {
  try {
    const { privateKey } = req.body;
    const identity = identityManager.create(privateKey);
    const commitment = identityManager.getCommitment(identity);
    const exported = identityManager.exportIdentity(identity);
    res.json({
      commitment: commitment.toString(),
      exportedKey: exported,
      publicKey: identity.publicKey?.toString() ?? '',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/identity/import
app.post('/api/identity/import', (req, res) => {
  try {
    const { exportedKey } = req.body;
    const identity = identityManager.importIdentity(exportedKey);
    const commitment = identityManager.getCommitment(identity);
    res.json({
      commitment: commitment.toString(),
      publicKey: identity.publicKey?.toString() ?? '',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/identity/sign
app.post('/api/identity/sign', (req, res) => {
  try {
    const { exportedKey, message } = req.body;
    const identity = identityManager.importIdentity(exportedKey);
    const signature = identityManager.signMessage(identity, message);
    res.json({ signature: JSON.stringify(signature) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/identity/verify-signature
app.post('/api/identity/verify-signature', (req, res) => {
  try {
    let { message, signature, publicKey } = req.body;
    // Parse signature back if it was serialized as JSON string
    if (typeof signature === 'string') {
      try { signature = JSON.parse(signature); } catch {}
    }
    const valid = identityManager.verifySignature(message, signature, publicKey);
    res.json({ valid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/identity/verify-email
app.post('/api/identity/verify-email', (req, res) => {
  try {
    const { emlContent } = req.body;
    const result = emailVerifier.verifyEmail(emlContent);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/identity/check-domain — simple email domain verification
app.post('/api/identity/check-domain', (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    const domain = email.split('@')[1].toLowerCase();
    const isAllowed = emailVerifier.isDomainAllowed(domain);
    res.json({
      email,
      domain,
      verified: isAllowed,
      message: isAllowed
        ? `✓ ${domain} is a verified university domain. You can post rumors!`
        : `✗ ${domain} is not a recognized university domain.`,
      allowedDomains: IDENTITY.ALLOWED_DOMAINS,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/identity/allowed-domains
app.get('/api/identity/allowed-domains', (_req, res) => {
  res.json({ allowedDomains: IDENTITY.ALLOWED_DOMAINS });
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  MEMBERSHIP TREE ENDPOINTS                                ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/membership/add-member
app.post('/api/membership/add-member', (req, res) => {
  try {
    const { commitment } = req.body;
    membershipTree.addMember(commitment);
    res.json({
      size: membershipTree.getSize(),
      root: membershipTree.getRoot().toString(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/membership/add-members
app.post('/api/membership/add-members', (req, res) => {
  try {
    const { commitments } = req.body;
    membershipTree.addMembers(commitments);
    res.json({
      size: membershipTree.getSize(),
      root: membershipTree.getRoot().toString(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/membership/remove-member
app.post('/api/membership/remove-member', (req, res) => {
  try {
    const { index } = req.body;
    membershipTree.removeMember(index);
    res.json({
      size: membershipTree.getSize(),
      root: membershipTree.getRoot().toString(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/membership/merkle-proof
app.post('/api/membership/merkle-proof', (req, res) => {
  try {
    const { leafIndex } = req.body;
    const proof = membershipTree.generateMerkleProof(leafIndex);
    res.json({
      root: proof.root.toString(),
      depth: proof.depth,
      index: proof.index,
      siblings: proof.siblings.map(s => s.toString()),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/membership/verify-proof
app.post('/api/membership/verify-proof', (req, res) => {
  try {
    const { proof } = req.body;
    const valid = membershipTree.verifyMerkleProof(proof);
    res.json({ valid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/membership/index-of
app.post('/api/membership/index-of', (req, res) => {
  try {
    const { commitment } = req.body;
    const index = membershipTree.indexOf(commitment);
    res.json({ index });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/membership/info
app.get('/api/membership/info', (_req, res) => {
  try {
    res.json({
      size: membershipTree.getSize(),
      depth: membershipTree.getDepth(),
      root: membershipTree.getRoot().toString(),
      members: membershipTree.getMembers().map(m => m.toString()),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/membership/root-history
app.get('/api/membership/root-history', (req, res) => {
  try {
    const n = parseInt(req.query.n) || 5;
    const history = membershipTree.getRootHistory(n).map(r => r.toString());
    res.json({ rootHistory: history });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  SCORING ENDPOINTS                                        ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/scoring/bts/calculate
app.post('/api/scoring/bts/calculate', (req, res) => {
  try {
    const { dampenedVotes } = req.body;
    const result = btsEngine.calculate(dampenedVotes);
    // Convert Map to object for JSON
    const voterScores = {};
    for (const [k, v] of result.voterScores) voterScores[k] = v;
    res.json({
      rumorTrustScore: result.rumorTrustScore,
      voterScores,
      actualProportions: result.actualProportions,
      geometricMeans: result.geometricMeans,
      consensus: result.consensus,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/scoring/rbts/calculate
app.post('/api/scoring/rbts/calculate', (req, res) => {
  try {
    const { dampenedVotes, rumorId, blockHeight } = req.body;
    const result = rbtsEngine.calculate(dampenedVotes, rumorId, blockHeight);
    const voterScores = {};
    for (const [k, v] of result.voterScores) voterScores[k] = v;
    const peerAssignments = {};
    if (result.peerAssignments) {
      for (const [k, v] of result.peerAssignments) peerAssignments[k] = v;
    }
    res.json({
      rumorTrustScore: result.rumorTrustScore,
      voterScores,
      actualProportions: result.actualProportions,
      peerAssignments,
      consensus: result.consensus,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/scoring/dampen
app.post('/api/scoring/dampen', (req, res) => {
  try {
    const { votes, voteHistory } = req.body;
    // Reconstruct voteHistory as a Map
    const historyMap = new Map(Object.entries(voteHistory || {}));
    const result = correlationDampener.dampen(votes, historyMap);
    res.json({ dampenedVotes: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  REPUTATION ENDPOINTS                                     ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/reputation/register
app.post('/api/reputation/register', (req, res) => {
  try {
    const { nullifierId } = req.body;
    const score = reputationManager.register(nullifierId);
    res.json({ nullifierId, score });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/reputation/score/:nullifierId
app.get('/api/reputation/score/:nullifierId', (req, res) => {
  try {
    const score = reputationManager.getScore(req.params.nullifierId);
    res.json({ nullifierId: req.params.nullifierId, score });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/reputation/user/:nullifierId
app.get('/api/reputation/user/:nullifierId', (req, res) => {
  try {
    const user = reputationManager.getUser(req.params.nullifierId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      nullifierId: req.params.nullifierId,
      score: user.score,
      historyLength: user.history.length,
      history: user.history.slice(-20), // last 20 entries
      lockedStakes: user.stakes.size,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/reputation/all
app.get('/api/reputation/all', (_req, res) => {
  try {
    const allScores = reputationManager.getAllScores();
    const scores = {};
    for (const [k, v] of allScores) scores[k] = v;
    res.json({ scores, userCount: reputationManager.userCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/can-stake
app.post('/api/reputation/can-stake', (req, res) => {
  try {
    const { nullifierId, amount, action } = req.body;
    const canStake = reputationManager.canStake(nullifierId, amount, action);
    res.json({ canStake });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/lock-stake
app.post('/api/reputation/lock-stake', (req, res) => {
  try {
    const { nullifierId, amount, actionId, action } = req.body;
    const lock = reputationManager.lockStake(nullifierId, amount, actionId, action);
    res.json(lock);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/release-lock
app.post('/api/reputation/release-lock', (req, res) => {
  try {
    const { nullifierId, actionId } = req.body;
    const released = reputationManager.releaseLock(nullifierId, actionId);
    res.json({ released });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/apply-scores
app.post('/api/reputation/apply-scores', (req, res) => {
  try {
    const { voterScores, rumorId, stakeAmounts } = req.body;
    // Reconstruct Maps
    const btsResult = {
      voterScores: new Map(Object.entries(voterScores || {})),
    };
    const stakeMap = new Map(Object.entries(stakeAmounts || {}));
    const result = reputationManager.applyScores(btsResult, rumorId, stakeMap);
    const rewards = {};
    const slashes = {};
    for (const [k, v] of result.rewards) rewards[k] = v;
    for (const [k, v] of result.slashes) slashes[k] = v;
    res.json({ rewards, slashes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/apply-group-slash
app.post('/api/reputation/apply-group-slash', (req, res) => {
  try {
    const { groupNullifiers, basePenalty, rumorId } = req.body;
    const result = reputationManager.applyGroupSlash(groupNullifiers, basePenalty, rumorId);
    const slashes = {};
    for (const [k, v] of result) slashes[k] = v;
    res.json({ slashes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/apply-decay
app.post('/api/reputation/apply-decay', (req, res) => {
  try {
    const { rate } = req.body;
    reputationManager.applyDecay(rate);
    res.json({ message: 'Decay applied', userCount: reputationManager.userCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/apply-recovery
app.post('/api/reputation/apply-recovery', (req, res) => {
  try {
    const { rate } = req.body;
    reputationManager.applyRecovery(rate);
    res.json({ message: 'Recovery applied', userCount: reputationManager.userCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/export
app.post('/api/reputation/export', (_req, res) => {
  try {
    res.json({ data: reputationManager.export() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/reputation/import
app.post('/api/reputation/import', (req, res) => {
  try {
    const { data } = req.body;
    reputationManager.import(data);
    res.json({ message: 'Imported', userCount: reputationManager.userCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  TRUST PROPAGATOR ENDPOINTS                               ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/trust/build-graph
app.post('/api/trust/build-graph', (req, res) => {
  try {
    const { voteHistory, scoreHistory } = req.body;
    const voteMap = new Map(Object.entries(voteHistory || {}));
    const scoreMap = new Map(Object.entries(scoreHistory || {}));
    // Convert voterScores back to Maps inside scoreMap
    for (const [k, v] of scoreMap) {
      if (v.voterScores && !(v.voterScores instanceof Map)) {
        v.voterScores = new Map(Object.entries(v.voterScores));
      }
    }
    const graph = trustPropagator.buildGraph(voteMap, scoreMap);
    res.json({
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.size,
      nodes: [...graph.nodes],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/trust/compute-ppr
app.post('/api/trust/compute-ppr', (req, res) => {
  try {
    const { voteHistory, scoreHistory, trustSeeds } = req.body;
    const voteMap = new Map(Object.entries(voteHistory || {}));
    const scoreMap = new Map(Object.entries(scoreHistory || {}));
    for (const [k, v] of scoreMap) {
      if (v.voterScores && !(v.voterScores instanceof Map)) {
        v.voterScores = new Map(Object.entries(v.voterScores));
      }
    }
    const graph = trustPropagator.buildGraph(voteMap, scoreMap);
    const seedMap = trustSeeds ? new Map(Object.entries(trustSeeds)) : null;
    const result = trustPropagator.computePPR(graph, seedMap);
    const scores = {};
    for (const [k, v] of result.scores) scores[k] = v;
    res.json({
      scores,
      iterations: result.iterations,
      converged: result.converged,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  SNAPSHOTTER ENDPOINTS                                    ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/state/ingest
app.post('/api/state/ingest', (req, res) => {
  try {
    const { op } = req.body;
    const snapshot = snapshotter.ingest(op);
    res.json({
      snapshotTriggered: !!snapshot,
      snapshot: snapshot || null,
      opsSinceSnapshot: snapshotter.opsSinceSnapshot,
      snapshotCount: snapshotter.snapshotCount,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/state/ingest-batch
app.post('/api/state/ingest-batch', (req, res) => {
  try {
    const { ops } = req.body;
    const snapshot = snapshotter.ingestBatch(ops);
    res.json({
      snapshotTriggered: !!snapshot,
      snapshot: snapshot || null,
      opsSinceSnapshot: snapshotter.opsSinceSnapshot,
      snapshotCount: snapshotter.snapshotCount,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/state/rebuild
app.post('/api/state/rebuild', (_req, res) => {
  try {
    const snapshot = snapshotter.rebuild();
    // Convert Maps/Sets for JSON
    const state = {
      rumors: snapshot.state.rumors ? Object.fromEntries(snapshot.state.rumors) : {},
      votes: {},
      tombstones: snapshot.state.tombstones ? [...snapshot.state.tombstones] : [],
      reputation: snapshot.state.reputation ? Object.fromEntries(snapshot.state.reputation) : {},
    };
    if (snapshot.state.votes) {
      for (const [k, v] of snapshot.state.votes) {
        state.votes[k] = v;
      }
    }
    res.json({
      snapshotId: snapshot.snapshotId,
      timestamp: snapshot.timestamp,
      opLogLength: snapshot.opLogLength,
      activeRumors: snapshot.activeRumors,
      tombstonedRumors: snapshot.tombstonedRumors,
      totalVotes: snapshot.totalVotes,
      registeredUsers: snapshot.registeredUsers,
      state,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/state/snapshot
app.get('/api/state/snapshot', (_req, res) => {
  try {
    const snapshot = snapshotter.getLastSnapshot();
    if (!snapshot) return res.json({ snapshot: null });
    res.json({
      snapshotId: snapshot.snapshotId,
      timestamp: snapshot.timestamp,
      opLogLength: snapshot.opLogLength,
      activeRumors: snapshot.activeRumors,
      tombstonedRumors: snapshot.tombstonedRumors,
      totalVotes: snapshot.totalVotes,
      registeredUsers: snapshot.registeredUsers,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/state/oplog
app.get('/api/state/oplog', (_req, res) => {
  try {
    res.json({ opLog: snapshotter.getOpLog() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/state/info
app.get('/api/state/info', (_req, res) => {
  try {
    res.json({
      opsSinceSnapshot: snapshotter.opsSinceSnapshot,
      snapshotCount: snapshotter.snapshotCount,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/state/export
app.post('/api/state/export', (_req, res) => {
  try {
    res.json({ data: snapshotter.export() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/state/import
app.post('/api/state/import', (req, res) => {
  try {
    const { data } = req.body;
    snapshotter.import(data);
    res.json({ message: 'State imported and rebuilt' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  TOMBSTONE ENDPOINTS                                      ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/tombstone/register-rumor
app.post('/api/tombstone/register-rumor', (req, res) => {
  try {
    const { rumorId, authorNullifier, metadata } = req.body;
    tombstoneManager.registerRumor(rumorId, authorNullifier, metadata);
    res.json({ registered: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tombstone/create
app.post('/api/tombstone/create', (req, res) => {
  try {
    const { rumorId, authorNullifier, reason } = req.body;
    const tombstone = tombstoneManager.createTombstone({ rumorId, authorNullifier, reason });
    res.json(tombstone);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tombstone/admin-create
app.post('/api/tombstone/admin-create', (req, res) => {
  try {
    const { rumorId, reason, adminId } = req.body;
    const tombstone = tombstoneManager.createAdminTombstone(rumorId, reason, adminId);
    res.json(tombstone);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/tombstone/check/:rumorId
app.get('/api/tombstone/check/:rumorId', (req, res) => {
  try {
    const isTombstoned = tombstoneManager.isTombstoned(req.params.rumorId);
    const meta = tombstoneManager.getTombstone(req.params.rumorId);
    res.json({ isTombstoned, metadata: meta });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/tombstone/all
app.get('/api/tombstone/all', (_req, res) => {
  try {
    const ids = [...tombstoneManager.getTombstonedIds()];
    res.json({ tombstonedIds: ids, count: tombstoneManager.tombstoneCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tombstone/validate-vote
app.post('/api/tombstone/validate-vote', (req, res) => {
  try {
    const { rumorId } = req.body;
    const result = tombstoneManager.validateVote(rumorId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/tombstone/filter-active
app.post('/api/tombstone/filter-active', (req, res) => {
  try {
    const { rumors } = req.body;
    const active = tombstoneManager.filterActive(rumors);
    res.json({ activeRumors: active });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  CONFIG ENDPOINT                                          ║
// ╚═══════════════════════════════════════════════════════════╝

app.get('/api/config', (_req, res) => {
  res.json({
    IDENTITY,
    SCORING,
    PROTOCOL,
    NETWORK,
    STORAGE,
    MAX_RUMOR_LENGTH,
  });
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  START SERVER                                             ║
// ╚═══════════════════════════════════════════════════════════╝

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n  ┌─────────────────────────────────────────┐`);
  console.log(`  │  Afwaah API Server running on port ${PORT}  │`);
  console.log(`  └─────────────────────────────────────────┘\n`);
});

export default app;
