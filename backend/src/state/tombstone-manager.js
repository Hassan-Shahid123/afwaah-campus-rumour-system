// ─────────────────────────────────────────────────────────────
// Afwaah — Tombstone Manager
// Handles logical deletion of rumors in an append-only system.
//
// Since OrbitDB EventLogs are immutable (append-only Merkle DAG),
// we cannot delete entries. Instead, we append a TOMBSTONE
// operation that logically marks a rumor as deleted.
//
// The Tombstone Manager:
//   1. Validates tombstone requests (author nullifier must match)
//   2. Appends tombstone operations to the OpLog
//   3. Ensures tombstoned rumors are excluded from scoring
//   4. Prevents votes on tombstoned rumors
//   5. Tracks tombstone metadata for audit purposes
// ─────────────────────────────────────────────────────────────

import { PROTOCOL } from '../config.js';
import { EventEmitter } from 'events';

/**
 * TombstoneManager handles logical deletion of rumors.
 */
export class TombstoneManager extends EventEmitter {
  constructor() {
    super();

    /** @type {Map<string, object>} rumorId → tombstone metadata */
    this._tombstones = new Map();

    /** @type {Map<string, object>} rumorId → rumor metadata (needed for author validation) */
    this._rumorAuthors = new Map();

    /** @type {Set<string>} nullifiers that have been used for tombstones */
    this._tombstoneNullifiers = new Set();
  }

  // ── Rumor Registration ─────────────────────────────────────

  /**
   * Register a rumor's author for later tombstone validation.
   * Called when a new rumor is ingested.
   *
   * @param {string} rumorId
   * @param {string} authorNullifier — the nullifier hash of the author
   * @param {object} [metadata] — optional extra metadata
   */
  registerRumor(rumorId, authorNullifier, metadata = {}) {
    if (!rumorId || !authorNullifier) {
      throw new Error('E200: rumorId and authorNullifier are required');
    }

    this._rumorAuthors.set(rumorId, {
      authorNullifier,
      registeredAt: Date.now(),
      ...metadata,
    });
  }

  // ── Tombstone Operations ───────────────────────────────────

  /**
   * Validate and create a tombstone for a rumor.
   *
   * @param {object} request
   * @param {string} request.rumorId — the rumor to tombstone
   * @param {string} request.authorNullifier — must match the rumor's author
   * @param {string} [request.reason] — optional reason for deletion
   * @param {object} [request.zkProof] — ZK proof of authorship (optional for now)
   * @returns {object} tombstone operation
   * @throws if validation fails
   */
  createTombstone(request) {
    const { rumorId, authorNullifier, reason, zkProof } = request;

    // Validate required fields
    if (!rumorId) {
      throw new Error('E201: Missing rumorId in tombstone request');
    }
    if (!authorNullifier) {
      throw new Error('E202: Missing authorNullifier in tombstone request');
    }

    // Check if already tombstoned
    if (this._tombstones.has(rumorId)) {
      throw new Error('E203: Rumor is already tombstoned');
    }

    // Validate authorship — the requester must be the rumor's author
    const rumorMeta = this._rumorAuthors.get(rumorId);
    if (!rumorMeta) {
      throw new Error('E204: Rumor not found — cannot tombstone unknown rumor');
    }

    if (rumorMeta.authorNullifier !== authorNullifier) {
      throw new Error('E205: Tombstone denied — only the author can delete a rumor');
    }

    // Create the tombstone operation
    const tombstone = {
      type: PROTOCOL.TYPES.TOMBSTONE,
      version: PROTOCOL.VERSION,
      payload: {
        rumorId,
        authorNullifier,
        reason: reason || 'author_requested',
        zkProof: zkProof || null,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    // Record tombstone
    this._tombstones.set(rumorId, {
      ...tombstone.payload,
      tombstonedAt: Date.now(),
    });

    this._tombstoneNullifiers.add(`${rumorId}:${authorNullifier}`);

    this.emit('tombstone', tombstone);
    return tombstone;
  }

  /**
   * Create an admin/system tombstone (no author check).
   * Used for policy violations, spam removal, etc.
   *
   * @param {string} rumorId
   * @param {string} reason
   * @param {string} [adminId]
   * @returns {object} tombstone operation
   */
  createAdminTombstone(rumorId, reason, adminId = 'system') {
    if (!rumorId) {
      throw new Error('E206: Missing rumorId for admin tombstone');
    }

    if (this._tombstones.has(rumorId)) {
      throw new Error('E203: Rumor is already tombstoned');
    }

    const tombstone = {
      type: PROTOCOL.TYPES.TOMBSTONE,
      version: PROTOCOL.VERSION,
      payload: {
        rumorId,
        authorNullifier: adminId,
        reason: reason || 'admin_removal',
        admin: true,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    this._tombstones.set(rumorId, {
      ...tombstone.payload,
      tombstonedAt: Date.now(),
    });

    this.emit('tombstone', tombstone);
    return tombstone;
  }

  // ── Queries ────────────────────────────────────────────────

  /**
   * Check if a rumor is tombstoned.
   * @param {string} rumorId
   * @returns {boolean}
   */
  isTombstoned(rumorId) {
    return this._tombstones.has(rumorId);
  }

  /**
   * Get tombstone metadata for a rumor.
   * @param {string} rumorId
   * @returns {object|null}
   */
  getTombstone(rumorId) {
    return this._tombstones.get(rumorId) || null;
  }

  /**
   * Get all tombstoned rumor IDs.
   * @returns {Set<string>}
   */
  getTombstonedIds() {
    return new Set(this._tombstones.keys());
  }

  /**
   * Get the total number of tombstones.
   * @returns {number}
   */
  get tombstoneCount() {
    return this._tombstones.size;
  }

  /**
   * Validate whether a vote should be accepted.
   * Rejects votes on tombstoned rumors.
   *
   * @param {string} rumorId
   * @returns {{valid: boolean, reason?: string}}
   */
  validateVote(rumorId) {
    if (this._tombstones.has(rumorId)) {
      return {
        valid: false,
        reason: 'E010: Cannot vote on a tombstoned rumor',
      };
    }
    return { valid: true };
  }

  /**
   * Filter an array of rumors, removing tombstoned entries.
   *
   * @param {Array<{id: string}>} rumors
   * @returns {Array<{id: string}>}
   */
  filterActive(rumors) {
    return rumors.filter(r => {
      const id = r.id || r.rumorId;
      return !this._tombstones.has(id);
    });
  }

  /**
   * Filter an array of vote arrays by rumorId, removing votes for tombstoned rumors.
   *
   * @param {Map<string, Array>} votesByRumor — rumorId → votes[]
   * @returns {Map<string, Array>} — only non-tombstoned rumors' votes
   */
  filterActiveVotes(votesByRumor) {
    const result = new Map();
    for (const [rumorId, votes] of votesByRumor) {
      if (!this._tombstones.has(rumorId)) {
        result.set(rumorId, votes);
      }
    }
    return result;
  }

  // ── Bulk State ─────────────────────────────────────────────

  /**
   * Export all tombstone data (for persistence / sync).
   * @returns {Array<{rumorId: string, metadata: object}>}
   */
  export() {
    const data = [];
    for (const [rumorId, meta] of this._tombstones) {
      data.push({ rumorId, metadata: meta });
    }
    return data;
  }

  /**
   * Import tombstone data.
   * @param {Array<{rumorId: string, metadata: object}>} data
   */
  import(data) {
    for (const entry of data) {
      this._tombstones.set(entry.rumorId, entry.metadata);
    }
  }

  /**
   * Import rumor author registrations.
   * @param {Array<{rumorId: string, authorNullifier: string}>} data
   */
  importRumorAuthors(data) {
    for (const entry of data) {
      this._rumorAuthors.set(entry.rumorId, {
        authorNullifier: entry.authorNullifier,
        registeredAt: entry.registeredAt || Date.now(),
      });
    }
  }

  /**
   * Clear all tombstones (for testing).
   */
  clear() {
    this._tombstones.clear();
    this._rumorAuthors.clear();
    this._tombstoneNullifiers.clear();
  }
}
