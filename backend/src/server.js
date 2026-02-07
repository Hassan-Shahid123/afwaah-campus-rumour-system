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
import { generateProof, verifyProof } from '@semaphore-protocol/proof';
import { AfwaahNode } from './network/node.js';
import { GossipController } from './network/gossip-controller.js';

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

// ── ZK Proof State ───────────────────────────────────────────
const usedNullifiers = new Map();   // scope → Set<nullifier>

// ── DKIM-to-Commitment Binding ───────────────────────────────
const verifiedEmailBindings = new Map();  // email → commitment

// ── Score Finalization ───────────────────────────────────────
const finalizedScores = new Map();  // rumorId → { score, consensus, ... }

// ── P2P Network ─────────────────────────────────────────────
let p2pNode = null;
let gossipController = null;
let p2pStatus = { started: false, peerId: null, peers: 0, error: null };

/**
 * Convert an arbitrary string to a field element (bigint string)
 * for use as ZK proof message/scope parameters.
 */
function hashToField(str) {
  let hash = 0n;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5n) - hash + BigInt(str.charCodeAt(i))) & ((1n << 250n) - 1n);
  }
  return hash.toString();
}

/**
 * Start the libp2p P2P node in the background.
 * Non-blocking — if P2P fails, the server continues in centralized mode.
 */
async function startP2P() {
  try {
    p2pNode = new AfwaahNode();
    await p2pNode.start();

    gossipController = new GossipController(p2pNode);
    gossipController.start();

    // Bridge incoming gossip messages → snapshotter
    gossipController.onRumor((msg) => {
      try { snapshotter.ingest({ type: 'RUMOR', payload: msg.payload, timestamp: msg.timestamp }); } catch {}
    });
    gossipController.onVote((msg) => {
      try { snapshotter.ingest({ type: 'VOTE', payload: msg.payload, timestamp: msg.timestamp }); } catch {}
    });
    gossipController.onTombstone((msg) => {
      try { snapshotter.ingest({ type: 'TOMBSTONE', payload: msg.payload, timestamp: msg.timestamp }); } catch {}
    });
    gossipController.onJoin((msg) => {
      try { snapshotter.ingest({ type: 'JOIN', payload: msg.payload, timestamp: msg.timestamp }); } catch {}
    });

    p2pStatus = {
      started: true,
      peerId: p2pNode.peerId.toString(),
      peers: p2pNode.getConnectedPeers().length,
      multiaddrs: p2pNode.getMultiaddrs().map(ma => ma.toString()),
      error: null,
    };

    setInterval(() => {
      if (p2pNode?.isStarted) {
        p2pStatus.peers = p2pNode.getConnectedPeers().length;
      }
    }, 5000);

    console.log(`  P2P node started: ${p2pStatus.peerId}`);
  } catch (err) {
    p2pStatus = { started: false, peerId: null, peers: 0, error: err.message };
    console.warn(`  P2P not available: ${err.message} (running in centralized mode)`);
  }
}

/**
 * Auto-trigger BTS/RBTS scoring pipeline after a vote is ingested.
 */
function autoScoreRumor(rumorId) {
  if (finalizedScores.has(rumorId)) return null;

  const votes = snapshotter.getVotesForRumor(rumorId);
  if (!votes || votes.length < 3) return null;

  try {
    const dampenedVotes = correlationDampener.dampen(votes, new Map());
    const engine = dampenedVotes.length >= SCORING.RBTS_THRESHOLD ? btsEngine : rbtsEngine;
    const result = dampenedVotes.length >= SCORING.RBTS_THRESHOLD
      ? engine.calculate(dampenedVotes)
      : engine.calculate(dampenedVotes, rumorId, 0);

    if (result.voterScores.size > 0) {
      reputationManager.applyScores(result, rumorId);
    }

    return {
      triggered: true,
      rumorId,
      voterCount: dampenedVotes.length,
      consensus: result.consensus,
      rumorTrustScore: result.rumorTrustScore,
    };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

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
    if (!exportedKey || typeof exportedKey !== 'string' || exportedKey.trim().length === 0) {
      return res.status(400).json({ error: 'Recovery key is required' });
    }

    // Try to import — will throw if the key is structurally invalid
    let identity;
    try {
      identity = identityManager.importIdentity(exportedKey.trim());
    } catch (importErr) {
      return res.status(400).json({ error: 'Invalid recovery key — the key format is not recognized. Please check and try again.' });
    }

    const commitment = identityManager.getCommitment(identity);

    // Check if this commitment exists in the membership tree
    const memberIndex = membershipTree.indexOf(commitment);
    if (memberIndex === -1) {
      return res.status(404).json({
        error: 'No account found for this recovery key. This key does not match any registered member. Make sure you are using the correct key from an account that was previously created.',
        found: false,
      });
    }

    res.json({
      commitment: commitment.toString(),
      publicKey: identity.publicKey?.toString() ?? '',
      memberIndex,
      found: true,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/identity/sign
app.post('/api/identity/sign', (req, res) => {
  try {
    const { exportedKey, message } = req.body;
    if (!exportedKey || !message) {
      return res.status(400).json({ error: 'exportedKey and message are required' });
    }
    const identity = identityManager.importIdentity(exportedKey);
    const signature = identityManager.signMessage(identity, message);
    // BigInt-safe serialization — convert BigInts to strings
    const sigStr = JSON.stringify(signature, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
    // Also return the public key in a format that can be sent back for verification
    const pubKeyStr = identity.publicKey.map(p => p.toString());
    res.json({ signature: sigStr, publicKey: pubKeyStr });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/identity/verify-signature
app.post('/api/identity/verify-signature', (req, res) => {
  try {
    let { message, signature, publicKey } = req.body;
    if (!message || !signature || !publicKey) {
      return res.status(400).json({ error: 'message, signature, and publicKey are required' });
    }

    // Reconstruct signature: parse JSON string → convert string numbers back to BigInt
    if (typeof signature === 'string') {
      try { signature = JSON.parse(signature); } catch {}
    }
    if (signature && signature.R8 && signature.S) {
      signature = {
        R8: signature.R8.map(v => BigInt(v)),
        S: BigInt(signature.S),
      };
    }

    // Reconstruct publicKey: "num1,num2" string or ["num1","num2"] array → [BigInt, BigInt]
    if (typeof publicKey === 'string') {
      // Could be JSON array or comma-separated
      try {
        const parsed = JSON.parse(publicKey);
        publicKey = parsed;
      } catch {
        publicKey = publicKey.split(',').map(s => s.trim());
      }
    }
    if (Array.isArray(publicKey)) {
      publicKey = publicKey.map(v => BigInt(v));
    }

    const valid = identityManager.verifySignature(message, signature, publicKey);
    res.json({ valid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/identity/verify-email
app.post('/api/identity/verify-email', async (req, res) => {
  try {
    const { emlContent } = req.body;
    if (!emlContent) {
      return res.status(400).json({ error: 'Please paste the .eml file content' });
    }
    const result = await emailVerifier.verifyEmail(emlContent);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/identity/allowed-domains
app.get('/api/identity/allowed-domains', (_req, res) => {
  res.json({ allowedDomains: IDENTITY.ALLOWED_DOMAINS });
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  DKIM-TO-COMMITMENT BINDING                               ║
// ║  Cryptographically links email verification to identity   ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/identity/verify-and-register
// Combined: DKIM-verify email + bind to identity + add to membership tree
app.post('/api/identity/verify-and-register', async (req, res) => {
  try {
    const { emlContent, exportedKey } = req.body;
    if (!emlContent || !exportedKey) {
      return res.status(400).json({ error: 'Both emlContent and exportedKey are required' });
    }

    // Step 1: Cryptographically verify the email via DKIM
    const dkimResult = await emailVerifier.verifyEmail(emlContent);

    // Step 2: Derive the binding key from the verified inbox email
    const emailKey = dkimResult.deliveredTo.toLowerCase();

    // Step 3: Check if this email has already been used (1 email = 1 identity)
    if (verifiedEmailBindings.has(emailKey)) {
      return res.status(409).json({
        error: `This university email (${emailKey}) has already been used to register an identity. One email = one anonymous identity.`,
        existingCommitment: verifiedEmailBindings.get(emailKey),
      });
    }

    // Step 4: Reconstruct the identity and get commitment
    const identity = identityManager.importIdentity(exportedKey);
    const commitment = identityManager.getCommitment(identity);

    // Step 5: Add to membership tree (or reuse existing member)
    let memberIndex = membershipTree.indexOf(commitment);
    if (memberIndex === -1) {
      memberIndex = membershipTree.addMember(commitment);
    }

    // Step 6: Store the cryptographic binding: email → commitment
    verifiedEmailBindings.set(emailKey, commitment.toString());

    // Step 7: Register in reputation system
    const nullifier = `user_${commitment.toString().substring(0, 12)}`;
    reputationManager.register(nullifier);

    // Step 8: Record JOIN in the snapshotter opLog
    snapshotter.ingest({
      type: 'JOIN',
      payload: {
        commitment: commitment.toString(),
        nullifier,
        emailDomain: dkimResult.domain,
        emailVerified: true,
        dkimBinding: { email: emailKey, bodyHash: dkimResult.bodyHash },
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });

    // Broadcast via P2P if available
    if (gossipController && p2pNode?.isStarted) {
      gossipController.publishJoin({ commitment: commitment.toString(), nullifier }).catch(() => {});
    }

    res.json({
      success: true,
      email: emailKey,
      commitment: commitment.toString(),
      memberIndex,
      dkimResult,
      binding: { email: emailKey, commitment: commitment.toString(), bodyHash: dkimResult.bodyHash },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/identity/bindings — list all email-to-commitment bindings
app.get('/api/identity/bindings', (_req, res) => {
  const bindings = {};
  for (const [email, commitment] of verifiedEmailBindings) {
    bindings[email] = commitment;
  }
  res.json({ bindings, count: verifiedEmailBindings.size });
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  ZK PROOF ENDPOINTS                                       ║
// ║  Generate and verify Semaphore V4 zero-knowledge proofs   ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/zk/generate-proof
app.post('/api/zk/generate-proof', async (req, res) => {
  try {
    const { exportedKey, message, scope } = req.body;
    if (!exportedKey || message === undefined || scope === undefined) {
      return res.status(400).json({ error: 'exportedKey, message, and scope are required' });
    }

    const identity = identityManager.importIdentity(exportedKey);
    const group = membershipTree.getGroup();

    if (group.size === 0) {
      return res.status(400).json({ error: 'No members in the group yet. Register your identity first.' });
    }

    // Convert string-based message/scope to field elements
    const msgField = typeof message === 'string' && !/^\d+$/.test(message)
      ? hashToField(message) : message.toString();
    const scopeField = typeof scope === 'string' && !/^\d+$/.test(scope)
      ? hashToField(scope) : scope.toString();

    const proof = await generateProof(identity, group, msgField, scopeField);

    // Serialize proof (BigInts → strings)
    res.json({
      merkleTreeDepth: proof.merkleTreeDepth,
      merkleTreeRoot: proof.merkleTreeRoot.toString(),
      nullifier: proof.nullifier.toString(),
      message: proof.message.toString(),
      scope: proof.scope.toString(),
      points: proof.points,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/zk/verify-proof
app.post('/api/zk/verify-proof', async (req, res) => {
  try {
    const { proof } = req.body;
    if (!proof) {
      return res.status(400).json({ error: 'proof object is required' });
    }

    const isValid = await verifyProof(proof);

    // Check nullifier uniqueness for the given scope
    const scope = proof.scope?.toString() || '';
    const nullifier = proof.nullifier?.toString() || '';
    let isNullifierNew = true;

    if (scope && nullifier) {
      if (!usedNullifiers.has(scope)) usedNullifiers.set(scope, new Set());
      isNullifierNew = !usedNullifiers.get(scope).has(nullifier);
    }

    res.json({ valid: isValid, nullifier, isNullifierNew });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/zk/record-nullifier — mark a nullifier as used for a scope
app.post('/api/zk/record-nullifier', (req, res) => {
  try {
    const { scope, nullifier } = req.body;
    const s = scope?.toString() || '';
    const n = nullifier?.toString() || '';
    if (!usedNullifiers.has(s)) usedNullifiers.set(s, new Set());
    usedNullifiers.get(s).add(n);
    res.json({ recorded: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
// ║  SCORE FINALIZATION ENDPOINTS                             ║
// ║  Freeze a rumor's score so decay cannot drift it          ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/scoring/finalize — lock a rumor's score permanently
app.post('/api/scoring/finalize', (req, res) => {
  try {
    const { rumorId } = req.body;
    if (!rumorId) return res.status(400).json({ error: 'rumorId is required' });

    if (finalizedScores.has(rumorId)) {
      return res.status(409).json({ error: 'Score already finalized', finalized: finalizedScores.get(rumorId) });
    }

    const votes = snapshotter.getVotesForRumor(rumorId);
    if (!votes || votes.length === 0) {
      return res.status(400).json({ error: 'No votes found for this rumor' });
    }

    // Run the full scoring pipeline one final time
    const dampenedVotes = correlationDampener.dampen(votes, new Map());
    const engine = dampenedVotes.length >= SCORING.RBTS_THRESHOLD ? btsEngine : rbtsEngine;
    const result = dampenedVotes.length >= SCORING.RBTS_THRESHOLD
      ? engine.calculate(dampenedVotes)
      : engine.calculate(dampenedVotes, rumorId, 0);

    const finalized = {
      rumorId,
      score: result.rumorTrustScore,
      consensus: result.consensus,
      actualProportions: result.actualProportions,
      voterCount: votes.length,
      finalizedAt: Date.now(),
      locked: true,
    };

    finalizedScores.set(rumorId, finalized);
    res.json(finalized);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/scoring/finalized/:rumorId
app.get('/api/scoring/finalized/:rumorId', (req, res) => {
  const finalized = finalizedScores.get(req.params.rumorId);
  if (!finalized) return res.json({ finalized: false });
  res.json({ finalized: true, ...finalized });
});

// GET /api/scoring/finalized-all
app.get('/api/scoring/finalized-all', (_req, res) => {
  const all = {};
  for (const [k, v] of finalizedScores) all[k] = v;
  res.json({ scores: all, count: finalizedScores.size });
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
// ║  P2P NETWORK ENDPOINTS                                    ║
// ╚═══════════════════════════════════════════════════════════╝

// GET /api/network/status — live P2P node status
app.get('/api/network/status', (_req, res) => {
  if (p2pNode && p2pNode.isStarted) {
    p2pStatus.peers = p2pNode.getConnectedPeers().length;
    try { p2pStatus.multiaddrs = p2pNode.getMultiaddrs().map(ma => ma.toString()); } catch {}
  }
  res.json(p2pStatus);
});

// GET /api/network/peers — list connected peers
app.get('/api/network/peers', (_req, res) => {
  if (!p2pNode || !p2pNode.isStarted) {
    return res.json({ peers: [], count: 0 });
  }
  const peers = p2pNode.getConnectedPeers().map(p => p.toString());
  res.json({ peers, count: peers.length });
});

// GET /api/network/topics — list subscribed gossip topics
app.get('/api/network/topics', (_req, res) => {
  res.json({ topics: PROTOCOL.TOPICS });
});

// ╔═══════════════════════════════════════════════════════════╗
// ║  SNAPSHOTTER ENDPOINTS                                    ║
// ╚═══════════════════════════════════════════════════════════╝

// POST /api/state/ingest — enhanced with ZK verification, auto-scoring, P2P broadcast
app.post('/api/state/ingest', async (req, res) => {
  try {
    const { op } = req.body;
    const responseData = {};

    // ── ZK Proof verification (if included) ──────────────────
    if (op.payload?.zkProof) {
      const proof = op.payload.zkProof;
      try {
        const isValid = await verifyProof(proof);
        if (!isValid) {
          return res.status(400).json({ error: 'Invalid ZK proof — membership not verified' });
        }

        // Check and record nullifier to prevent double-action
        const scope = proof.scope?.toString() || '';
        const nullifier = proof.nullifier?.toString() || '';
        if (scope && nullifier) {
          if (!usedNullifiers.has(scope)) usedNullifiers.set(scope, new Set());
          if (usedNullifiers.get(scope).has(nullifier)) {
            return res.status(400).json({ error: 'Duplicate action — this nullifier was already used for this scope' });
          }
          usedNullifiers.get(scope).add(nullifier);
        }

        // Use the ZK proof nullifier as the verified anonymous identifier
        op.payload.nullifier = `zk_${nullifier.substring(0, 16)}`;
        op.payload.zkVerified = true;
        responseData.zkVerified = true;
        responseData.zkNullifier = op.payload.nullifier;
      } catch (zkErr) {
        // ZK verification error — allow operation to proceed without ZK
        responseData.zkError = zkErr.message;
      }
    }

    // ── Server-side validation ────────────────────────────────
    if (op.type === 'VOTE' && op.payload?.rumorId) {
      // Prevent self-voting: check if this user authored the rumor
      const rumorData = snapshotter.getRumor(op.payload.rumorId);
      if (rumorData && op.payload.nullifier && rumorData.nullifier === op.payload.nullifier) {
        return res.status(403).json({ error: 'You cannot vote on your own rumor' });
      }

      // Prevent duplicate voting on the same rumor
      const existingVotes = snapshotter.getVotesForRumor(op.payload.rumorId);
      if (op.payload.nullifier && existingVotes.some(v => v.nullifier === op.payload.nullifier)) {
        return res.status(409).json({ error: 'You have already voted on this rumor' });
      }
    }

    // ── Ingest the operation ─────────────────────────────────
    const snapshot = snapshotter.ingest(op);

    // ── Auto-trigger scoring pipeline on new votes (Fix 6) ───
    if (op.type === 'VOTE' && op.payload?.rumorId) {
      const scoringResult = autoScoreRumor(op.payload.rumorId);
      if (scoringResult) responseData.autoScoring = scoringResult;
    }

    // ── Broadcast via P2P gossip if available (Fix 2) ────────
    if (gossipController && p2pNode?.isStarted) {
      try {
        if (op.type === 'RUMOR') await gossipController.publishRumor(op.payload);
        else if (op.type === 'VOTE') await gossipController.publishVote(op.payload);
        else if (op.type === 'TOMBSTONE') await gossipController.publishTombstone(op.payload);
        else if (op.type === 'JOIN') await gossipController.publishJoin(op.payload);
        responseData.p2pBroadcast = true;
      } catch (p2pErr) {
        responseData.p2pBroadcast = false;
      }
    }

    res.json({
      snapshotTriggered: !!snapshot,
      snapshot: snapshot || null,
      opsSinceSnapshot: snapshotter.opsSinceSnapshot,
      snapshotCount: snapshotter.snapshotCount,
      ...responseData,
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

// Global error safety — never crash on bad input
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.message || err);
});

// Catch-all Express error handler
app.use((err, _req, res, _next) => {
  console.error('[Express error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// On Vercel, the serverless function handles requests — don't call listen()
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  ┌─────────────────────────────────────────┐`);
    console.log(`  │  Afwaah API Server running on port ${PORT}  │`);
    console.log(`  └─────────────────────────────────────────┘\n`);

    // Start P2P node in background (non-blocking — server works without it)
    startP2P();
  });
}

export default app;
