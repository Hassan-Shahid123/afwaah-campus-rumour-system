// ─────────────────────────────────────────────────────────────
// Afwaah — API client
// Consistent function names with backend classes.
// ─────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3001/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Identity ─────────────────────────────────────────────────

export const identityManager = {
  create: (privateKey) =>
    request('/identity/create', { method: 'POST', body: JSON.stringify({ privateKey }) }),
  importIdentity: (exportedKey) =>
    request('/identity/import', { method: 'POST', body: JSON.stringify({ exportedKey }) }),
  signMessage: (exportedKey, message) =>
    request('/identity/sign', { method: 'POST', body: JSON.stringify({ exportedKey, message }) }),
  verifySignature: (message, signature, publicKey) =>
    request('/identity/verify-signature', { method: 'POST', body: JSON.stringify({ message, signature, publicKey }) }),
};

export const emailVerifier = {
  checkDomain: (email) =>
    request('/identity/check-domain', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyEmail: (emlContent) =>
    request('/identity/verify-email', { method: 'POST', body: JSON.stringify({ emlContent }) }),
  getAllowedDomains: () =>
    request('/identity/allowed-domains'),
};

// ── Membership Tree ──────────────────────────────────────────

export const membershipTree = {
  addMember: (commitment) =>
    request('/membership/add-member', { method: 'POST', body: JSON.stringify({ commitment }) }),
  addMembers: (commitments) =>
    request('/membership/add-members', { method: 'POST', body: JSON.stringify({ commitments }) }),
  removeMember: (index) =>
    request('/membership/remove-member', { method: 'POST', body: JSON.stringify({ index }) }),
  generateMerkleProof: (leafIndex) =>
    request('/membership/merkle-proof', { method: 'POST', body: JSON.stringify({ leafIndex }) }),
  verifyMerkleProof: (proof) =>
    request('/membership/verify-proof', { method: 'POST', body: JSON.stringify({ proof }) }),
  indexOf: (commitment) =>
    request('/membership/index-of', { method: 'POST', body: JSON.stringify({ commitment }) }),
  getInfo: () =>
    request('/membership/info'),
  getRootHistory: (n) =>
    request(`/membership/root-history?n=${n || 5}`),
};

// ── Scoring ──────────────────────────────────────────────────

export const btsEngine = {
  calculate: (dampenedVotes) =>
    request('/scoring/bts/calculate', { method: 'POST', body: JSON.stringify({ dampenedVotes }) }),
};

export const rbtsEngine = {
  calculate: (dampenedVotes, rumorId, blockHeight) =>
    request('/scoring/rbts/calculate', { method: 'POST', body: JSON.stringify({ dampenedVotes, rumorId, blockHeight }) }),
};

export const correlationDampener = {
  dampen: (votes, voteHistory) =>
    request('/scoring/dampen', { method: 'POST', body: JSON.stringify({ votes, voteHistory }) }),
};

// ── Reputation ───────────────────────────────────────────────

export const reputationManager = {
  register: (nullifierId) =>
    request('/reputation/register', { method: 'POST', body: JSON.stringify({ nullifierId }) }),
  getScore: (nullifierId) =>
    request(`/reputation/score/${encodeURIComponent(nullifierId)}`),
  getUser: (nullifierId) =>
    request(`/reputation/user/${encodeURIComponent(nullifierId)}`),
  getAllScores: () =>
    request('/reputation/all'),
  canStake: (nullifierId, amount, action) =>
    request('/reputation/can-stake', { method: 'POST', body: JSON.stringify({ nullifierId, amount, action }) }),
  lockStake: (nullifierId, amount, actionId, action) =>
    request('/reputation/lock-stake', { method: 'POST', body: JSON.stringify({ nullifierId, amount, actionId, action }) }),
  releaseLock: (nullifierId, actionId) =>
    request('/reputation/release-lock', { method: 'POST', body: JSON.stringify({ nullifierId, actionId }) }),
  applyScores: (voterScores, rumorId, stakeAmounts) =>
    request('/reputation/apply-scores', { method: 'POST', body: JSON.stringify({ voterScores, rumorId, stakeAmounts }) }),
  applyGroupSlash: (groupNullifiers, basePenalty, rumorId) =>
    request('/reputation/apply-group-slash', { method: 'POST', body: JSON.stringify({ groupNullifiers, basePenalty, rumorId }) }),
  applyDecay: (rate) =>
    request('/reputation/apply-decay', { method: 'POST', body: JSON.stringify({ rate }) }),
  applyRecovery: (rate) =>
    request('/reputation/apply-recovery', { method: 'POST', body: JSON.stringify({ rate }) }),
  exportData: () =>
    request('/reputation/export', { method: 'POST' }),
  importData: (data) =>
    request('/reputation/import', { method: 'POST', body: JSON.stringify({ data }) }),
};

// ── Trust Propagator ─────────────────────────────────────────

export const trustPropagator = {
  buildGraph: (voteHistory, scoreHistory) =>
    request('/trust/build-graph', { method: 'POST', body: JSON.stringify({ voteHistory, scoreHistory }) }),
  computePPR: (voteHistory, scoreHistory, trustSeeds) =>
    request('/trust/compute-ppr', { method: 'POST', body: JSON.stringify({ voteHistory, scoreHistory, trustSeeds }) }),
};

// ── Snapshotter ──────────────────────────────────────────────

export const snapshotter = {
  ingest: (op) =>
    request('/state/ingest', { method: 'POST', body: JSON.stringify({ op }) }),
  ingestBatch: (ops) =>
    request('/state/ingest-batch', { method: 'POST', body: JSON.stringify({ ops }) }),
  rebuild: () =>
    request('/state/rebuild', { method: 'POST' }),
  getLastSnapshot: () =>
    request('/state/snapshot'),
  getOpLog: () =>
    request('/state/oplog'),
  getInfo: () =>
    request('/state/info'),
  exportData: () =>
    request('/state/export', { method: 'POST' }),
  importData: (data) =>
    request('/state/import', { method: 'POST', body: JSON.stringify({ data }) }),
};

// ── Tombstone Manager ────────────────────────────────────────

export const tombstoneManager = {
  registerRumor: (rumorId, authorNullifier, metadata) =>
    request('/tombstone/register-rumor', { method: 'POST', body: JSON.stringify({ rumorId, authorNullifier, metadata }) }),
  createTombstone: (rumorId, authorNullifier, reason) =>
    request('/tombstone/create', { method: 'POST', body: JSON.stringify({ rumorId, authorNullifier, reason }) }),
  createAdminTombstone: (rumorId, reason, adminId) =>
    request('/tombstone/admin-create', { method: 'POST', body: JSON.stringify({ rumorId, reason, adminId }) }),
  isTombstoned: (rumorId) =>
    request(`/tombstone/check/${encodeURIComponent(rumorId)}`),
  getAll: () =>
    request('/tombstone/all'),
  validateVote: (rumorId) =>
    request('/tombstone/validate-vote', { method: 'POST', body: JSON.stringify({ rumorId }) }),
  filterActive: (rumors) =>
    request('/tombstone/filter-active', { method: 'POST', body: JSON.stringify({ rumors }) }),
};

// ── Config ───────────────────────────────────────────────────

export const config = {
  get: () => request('/config'),
};
