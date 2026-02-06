// ─────────────────────────────────────────────────────────────
// Afwaah — Snapshotter
// Traverses the immutable OpLog (OrbitDB event entries),
// rebuilds a materialized view of the current system state,
// and emits snapshot CIDs for fast state recovery.
//
// The OpLog is the source of truth. The materialized view
// is a cache that can be discarded and rebuilt at any time.
//
// Every SNAPSHOT_INTERVAL operations, the Snapshotter:
//   1. Walks the entire OpLog
//   2. Skips tombstoned entries
//   3. Rebuilds active rumors, vote tallies, reputation scores
//   4. Emits a 'snapshot' event with the new state CID
// ─────────────────────────────────────────────────────────────

import { STORAGE, SCORING, PROTOCOL } from '../config.js';
import { EventEmitter } from 'events';

/**
 * Snapshotter rebuilds a materialized view from the immutable
 * OpLog, respecting tombstones and computing derived state.
 */
export class Snapshotter extends EventEmitter {
  /**
   * @param {object} [config]
   * @param {number} [config.snapshotInterval] — rebuild every N ops
   * @param {number} [config.initialTrustScore] — default score for new users
   */
  constructor(config = {}) {
    super();
    this.snapshotInterval = config.snapshotInterval ?? STORAGE.SNAPSHOT_INTERVAL;
    this.initialTrustScore = config.initialTrustScore ?? SCORING.INITIAL_TRUST_SCORE;

    /** @type {number} operations since last snapshot */
    this._opsSinceSnapshot = 0;

    /** @type {Map<string, object>} rumorId → rumor data */
    this._rumors = new Map();

    /** @type {Map<string, Array>} rumorId → votes[] */
    this._votes = new Map();

    /** @type {Set<string>} tombstoned rumor IDs */
    this._tombstones = new Set();

    /** @type {Map<string, number>} nullifier → reputation score */
    this._reputation = new Map();

    /** @type {Array<object>} ordered log of all operations */
    this._opLog = [];

    /** @type {number} total snapshots taken */
    this._snapshotCount = 0;

    /** @type {object|null} last snapshot */
    this._lastSnapshot = null;
  }

  // ── Operation Ingestion ────────────────────────────────────

  /**
   * Ingest a new operation (rumor, vote, tombstone, identity, etc.).
   * Triggers a snapshot rebuild if the interval is reached.
   *
   * @param {object} op — the operation
   * @param {string} op.type — JOIN | RUMOR | VOTE | TOMBSTONE
   * @param {object} op.payload
   * @param {number} [op.timestamp]
   * @returns {object|null} snapshot if one was triggered, null otherwise
   */
  ingest(op) {
    if (!op || !op.type) {
      throw new Error('E100: Invalid operation — missing type');
    }

    this._opLog.push({
      ...op,
      _ingestIndex: this._opLog.length,
      _ingestedAt: Date.now(),
    });

    // Apply operation to live state
    this._applyOp(op);

    this._opsSinceSnapshot++;

    // Check if we should rebuild
    if (this._opsSinceSnapshot >= this.snapshotInterval) {
      return this.rebuild();
    }

    return null;
  }

  /**
   * Ingest multiple operations in order.
   * @param {Array<object>} ops
   * @returns {object|null} last snapshot if any were triggered
   */
  ingestBatch(ops) {
    let lastSnapshot = null;
    for (const op of ops) {
      const snap = this.ingest(op);
      if (snap) lastSnapshot = snap;
    }
    return lastSnapshot;
  }

  // ── Snapshot Rebuild ───────────────────────────────────────

  /**
   * Full rebuild of the materialized view from the OpLog.
   * Walks every operation, skips tombstoned entries, and
   * rebuilds rumors, votes, and reputation from scratch.
   *
   * @returns {object} the snapshot
   */
  rebuild() {
    // Clear derived state
    this._rumors.clear();
    this._votes.clear();
    this._tombstones.clear();
    this._reputation.clear();

    // First pass: identify tombstones
    for (const op of this._opLog) {
      if (op.type === PROTOCOL.TYPES.TOMBSTONE && op.payload?.rumorId) {
        this._tombstones.add(op.payload.rumorId);
      }
    }

    // Second pass: rebuild state, skipping tombstoned entries
    for (const op of this._opLog) {
      if (op.type === PROTOCOL.TYPES.RUMOR) {
        const rumorId = op.payload?.id || op.payload?.rumorId;
        if (rumorId && !this._tombstones.has(rumorId)) {
          this._rumors.set(rumorId, {
            id: rumorId,
            text: op.payload.text,
            topic: op.payload.topic,
            nullifier: op.payload.nullifier || op.payload.zkProof?.nullifierHash,
            timestamp: op.timestamp || op.payload.timestamp,
          });
        }
      } else if (op.type === PROTOCOL.TYPES.VOTE) {
        const rumorId = op.payload?.rumorId;
        if (rumorId && !this._tombstones.has(rumorId)) {
          if (!this._votes.has(rumorId)) this._votes.set(rumorId, []);
          this._votes.get(rumorId).push({
            nullifier: op.payload.nullifier,
            vote: op.payload.vote,
            prediction: op.payload.prediction,
            stakeAmount: op.payload.stakeAmount || 1,
            timestamp: op.timestamp || op.payload.timestamp,
          });
        }
      } else if (op.type === PROTOCOL.TYPES.JOIN) {
        const nullifier = op.payload?.nullifier || op.payload?.commitment;
        if (nullifier && !this._reputation.has(nullifier)) {
          this._reputation.set(nullifier, this.initialTrustScore);
        }
      }
    }

    // Also register any voters we haven't seen in JOIN ops
    for (const [, votes] of this._votes) {
      for (const v of votes) {
        if (v.nullifier && !this._reputation.has(v.nullifier)) {
          this._reputation.set(v.nullifier, this.initialTrustScore);
        }
      }
    }

    // Build snapshot object
    this._snapshotCount++;
    this._opsSinceSnapshot = 0;

    const snapshot = {
      snapshotId: this._snapshotCount,
      timestamp: Date.now(),
      opLogLength: this._opLog.length,
      activeRumors: this._rumors.size,
      tombstonedRumors: this._tombstones.size,
      totalVotes: this._getTotalVoteCount(),
      registeredUsers: this._reputation.size,
      state: {
        rumors: new Map(this._rumors),
        votes: new Map(this._votes),
        tombstones: new Set(this._tombstones),
        reputation: new Map(this._reputation),
      },
    };

    this._lastSnapshot = snapshot;
    this.emit('snapshot', snapshot);
    return snapshot;
  }

  // ── Queries ────────────────────────────────────────────────

  /**
   * Get an active (non-tombstoned) rumor by ID.
   * @param {string} rumorId
   * @returns {object|null}
   */
  getRumor(rumorId) {
    if (this._tombstones.has(rumorId)) return null;
    return this._rumors.get(rumorId) || null;
  }

  /**
   * Get all active rumors.
   * @returns {Map<string, object>}
   */
  getActiveRumors() {
    return new Map(this._rumors);
  }

  /**
   * Get votes for a non-tombstoned rumor.
   * @param {string} rumorId
   * @returns {Array}
   */
  getVotesForRumor(rumorId) {
    if (this._tombstones.has(rumorId)) return [];
    return this._votes.get(rumorId) || [];
  }

  /**
   * Get reputation score for a user.
   * @param {string} nullifier
   * @returns {number}
   */
  getReputation(nullifier) {
    return this._reputation.get(nullifier) ?? 0;
  }

  /**
   * Set reputation score (after BTS scoring).
   * @param {string} nullifier
   * @param {number} score
   */
  setReputation(nullifier, score) {
    this._reputation.set(nullifier, Math.max(0, Math.min(1000, score)));
  }

  /**
   * Check if a rumor is tombstoned.
   * @param {string} rumorId
   * @returns {boolean}
   */
  isTombstoned(rumorId) {
    return this._tombstones.has(rumorId);
  }

  /**
   * Get the last snapshot.
   * @returns {object|null}
   */
  getLastSnapshot() {
    return this._lastSnapshot;
  }

  /**
   * Get the full OpLog.
   * @returns {Array<object>}
   */
  getOpLog() {
    return [...this._opLog];
  }

  /**
   * Operations since last snapshot.
   * @returns {number}
   */
  get opsSinceSnapshot() {
    return this._opsSinceSnapshot;
  }

  /**
   * Total snapshots taken.
   * @returns {number}
   */
  get snapshotCount() {
    return this._snapshotCount;
  }

  /**
   * Export the materialized view (for persistence or sync).
   * @returns {object}
   */
  export() {
    return {
      opLog: [...this._opLog],
      snapshotCount: this._snapshotCount,
      lastSnapshot: this._lastSnapshot,
    };
  }

  /**
   * Import state and rebuild.
   * @param {object} data — from export()
   */
  import(data) {
    this._opLog = data.opLog || [];
    this._snapshotCount = data.snapshotCount || 0;
    this.rebuild();
  }

  // ── Internal ───────────────────────────────────────────────

  /**
   * Apply a single operation to the live (incremental) state.
   * @private
   */
  _applyOp(op) {
    switch (op.type) {
      case PROTOCOL.TYPES.RUMOR: {
        const rumorId = op.payload?.id || op.payload?.rumorId;
        if (rumorId && !this._tombstones.has(rumorId)) {
          this._rumors.set(rumorId, {
            id: rumorId,
            text: op.payload.text,
            topic: op.payload.topic,
            nullifier: op.payload.nullifier || op.payload.zkProof?.nullifierHash,
            timestamp: op.timestamp || op.payload.timestamp,
          });
        }
        break;
      }
      case PROTOCOL.TYPES.VOTE: {
        const rumorId = op.payload?.rumorId;
        if (rumorId && !this._tombstones.has(rumorId)) {
          if (!this._votes.has(rumorId)) this._votes.set(rumorId, []);
          this._votes.get(rumorId).push({
            nullifier: op.payload.nullifier,
            vote: op.payload.vote,
            prediction: op.payload.prediction,
            stakeAmount: op.payload.stakeAmount || 1,
            timestamp: op.timestamp || op.payload.timestamp,
          });
        }
        break;
      }
      case PROTOCOL.TYPES.TOMBSTONE: {
        const rumorId = op.payload?.rumorId;
        if (rumorId) {
          this._tombstones.add(rumorId);
          this._rumors.delete(rumorId);
          this._votes.delete(rumorId);
        }
        break;
      }
      case PROTOCOL.TYPES.JOIN: {
        const nullifier = op.payload?.nullifier || op.payload?.commitment;
        if (nullifier && !this._reputation.has(nullifier)) {
          this._reputation.set(nullifier, this.initialTrustScore);
        }
        break;
      }
    }
  }

  /**
   * Total vote count across all active rumors.
   * @private
   */
  _getTotalVoteCount() {
    let total = 0;
    for (const [, votes] of this._votes) {
      total += votes.length;
    }
    return total;
  }
}
