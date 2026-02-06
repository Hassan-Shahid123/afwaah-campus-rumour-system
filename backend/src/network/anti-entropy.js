// ─────────────────────────────────────────────────────────────
// Afwaah — Anti-Entropy Sync
// Handles state reconciliation between peers after periods
// of disconnection using Merkle tree comparison and
// read-repair.
//
// When a peer reconnects:
//   1. Exchange Merkle roots for each data store
//   2. Compare roots — if they differ, the peer is stale
//   3. Compute a diff of missing operations
//   4. Send/receive only the missing entries (delta sync)
//   5. Apply received entries to local state
//
// This ensures eventual consistency with minimal bandwidth.
// ─────────────────────────────────────────────────────────────

import { PROTOCOL, NETWORK } from '../config.js';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

/**
 * AntiEntropySync manages state reconciliation between
 * peers using Merkle-tree-based delta synchronization.
 */
export class AntiEntropySync extends EventEmitter {
  /**
   * @param {object} [config]
   * @param {number} [config.syncCooldown] — ms between sync requests
   * @param {number} [config.maxBatchSize] — max entries per sync batch
   * @param {number} [config.maxMessageSize] — max message size in bytes
   */
  constructor(config = {}) {
    super();
    this.syncCooldown = config.syncCooldown ?? NETWORK.SYNC_COOLDOWN;
    this.maxBatchSize = config.maxBatchSize ?? 100;
    this.maxMessageSize = config.maxMessageSize ?? NETWORK.MAX_MESSAGE_SIZE;

    /** @type {Map<string, number>} peerId → last sync timestamp */
    this._lastSync = new Map();

    /** @type {Map<string, string>} storeKey → merkle root hash */
    this._localRoots = new Map();

    /** @type {boolean} */
    this._syncing = false;

    /** @type {number} total syncs completed */
    this._syncCount = 0;

    /** @type {number} total entries received via sync */
    this._entriesReceived = 0;

    /** @type {number} total entries sent via sync */
    this._entriesSent = 0;
  }

  // ── Merkle Root Management ─────────────────────────────────

  /**
   * Compute a Merkle root hash for a set of entries.
   * Uses a simple binary hash tree over entry hashes.
   *
   * @param {Array<object>} entries — the operation entries
   * @returns {string} hex Merkle root
   */
  computeMerkleRoot(entries) {
    if (!entries || entries.length === 0) {
      return this._hashLeaf('empty');
    }

    // Compute leaf hashes
    let hashes = entries.map(e => this._hashLeaf(JSON.stringify(e)));

    // Build tree bottom-up
    while (hashes.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < hashes.length; i += 2) {
        if (i + 1 < hashes.length) {
          nextLevel.push(this._hashPair(hashes[i], hashes[i + 1]));
        } else {
          // Odd node — promote
          nextLevel.push(hashes[i]);
        }
      }
      hashes = nextLevel;
    }

    return hashes[0];
  }

  /**
   * Update the local Merkle root for a specific store.
   *
   * @param {string} storeKey — e.g. 'rumors', 'votes', 'identities', 'reputation'
   * @param {Array<object>} entries — all entries in the store
   */
  updateLocalRoot(storeKey, entries) {
    const root = this.computeMerkleRoot(entries);
    this._localRoots.set(storeKey, root);
    return root;
  }

  /**
   * Get the local Merkle root for a store.
   * @param {string} storeKey
   * @returns {string|null}
   */
  getLocalRoot(storeKey) {
    return this._localRoots.get(storeKey) || null;
  }

  /**
   * Get all local Merkle roots.
   * @returns {Map<string, string>}
   */
  getAllLocalRoots() {
    return new Map(this._localRoots);
  }

  // ── Sync Protocol ─────────────────────────────────────────

  /**
   * Create a SYNC_REQUEST message to send to a peer.
   *
   * @param {string} [peerId] — the peer to sync with
   * @returns {object} sync request message
   */
  createSyncRequest(peerId) {
    // Check cooldown
    if (peerId) {
      const lastSync = this._lastSync.get(peerId) || 0;
      if (Date.now() - lastSync < this.syncCooldown) {
        return null; // too soon
      }
    }

    return {
      type: PROTOCOL.TYPES.SYNC_REQUEST,
      version: PROTOCOL.VERSION,
      payload: {
        roots: Object.fromEntries(this._localRoots),
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Handle an incoming SYNC_REQUEST from a peer.
   * Compare roots and determine what data to send back.
   *
   * @param {object} request — the sync request message
   * @param {Map<string, Array<object>>} localData — storeKey → entries
   * @returns {{response: object, diff: object}} — sync response + computed diff
   */
  handleSyncRequest(request, localData) {
    if (!request || !request.payload || !request.payload.roots) {
      throw new Error('E300: Invalid sync request');
    }

    const peerRoots = request.payload.roots;
    const diff = this._computeDiff(peerRoots, localData);

    const response = {
      type: PROTOCOL.TYPES.SYNC_RESPONSE,
      version: PROTOCOL.VERSION,
      payload: {
        roots: Object.fromEntries(this._localRoots),
        missingEntries: diff.entriesToSend,
        storesOutOfSync: diff.storesOutOfSync,
        timestamp: Date.now(),
      },
    };

    this._entriesSent += diff.totalEntriesToSend;
    return { response, diff };
  }

  /**
   * Handle an incoming SYNC_RESPONSE from a peer.
   * Applies missing entries to local state.
   *
   * @param {object} response — the sync response message
   * @param {string} peerId — the peer that responded
   * @returns {{applied: number, storesUpdated: string[]}}
   */
  handleSyncResponse(response, peerId) {
    if (!response || !response.payload) {
      throw new Error('E301: Invalid sync response');
    }

    const { missingEntries, storesOutOfSync } = response.payload;
    let applied = 0;
    const storesUpdated = [];

    if (missingEntries) {
      for (const [storeKey, entries] of Object.entries(missingEntries)) {
        if (entries && entries.length > 0) {
          storesUpdated.push(storeKey);
          applied += entries.length;
          this.emit('entries-received', {
            storeKey,
            entries,
            peerId,
          });
        }
      }
    }

    this._entriesReceived += applied;
    this._syncCount++;
    this._lastSync.set(peerId, Date.now());
    this._syncing = false;

    this.emit('sync-complete', {
      peerId,
      applied,
      storesUpdated,
      storesOutOfSync: storesOutOfSync || [],
    });

    return { applied, storesUpdated };
  }

  // ── Diff Computation ───────────────────────────────────────

  /**
   * Compute the difference between peer's state and local state.
   *
   * @param {object} peerRoots — storeKey → merkle root (from peer)
   * @param {Map<string, Array<object>>} localData — storeKey → entries
   * @returns {object} diff result
   */
  _computeDiff(peerRoots, localData) {
    const storesOutOfSync = [];
    const entriesToSend = {};
    let totalEntriesToSend = 0;

    for (const [storeKey, localRoot] of this._localRoots) {
      const peerRoot = peerRoots[storeKey];

      if (peerRoot !== localRoot) {
        storesOutOfSync.push(storeKey);

        // Peer's root differs — send our entries (naive full sync)
        // In production, this would be a tree-diff for bandwidth efficiency
        const entries = localData.get(storeKey) || [];
        const batch = entries.slice(0, this.maxBatchSize);
        entriesToSend[storeKey] = batch;
        totalEntriesToSend += batch.length;
      }
    }

    // Also check for stores we have but peer doesn't
    for (const [storeKey] of this._localRoots) {
      if (!(storeKey in peerRoots) && !storesOutOfSync.includes(storeKey)) {
        storesOutOfSync.push(storeKey);
        const entries = localData.get(storeKey) || [];
        const batch = entries.slice(0, this.maxBatchSize);
        entriesToSend[storeKey] = batch;
        totalEntriesToSend += batch.length;
      }
    }

    return { storesOutOfSync, entriesToSend, totalEntriesToSend };
  }

  // ── Read Repair ────────────────────────────────────────────

  /**
   * Perform read-repair: after receiving data, verify
   * consistency and fix any inconsistencies.
   *
   * @param {string} storeKey
   * @param {Array<object>} localEntries — current local entries
   * @param {Array<object>} receivedEntries — entries from peer
   * @returns {{merged: Array<object>, newEntries: number}}
   */
  readRepair(storeKey, localEntries, receivedEntries) {
    if (!receivedEntries || receivedEntries.length === 0) {
      return { merged: localEntries, newEntries: 0 };
    }

    // Build a Set of existing entry hashes for O(1) lookups
    const existingHashes = new Set(
      localEntries.map(e => this._hashLeaf(JSON.stringify(e)))
    );

    const newEntries = [];
    for (const entry of receivedEntries) {
      const hash = this._hashLeaf(JSON.stringify(entry));
      if (!existingHashes.has(hash)) {
        newEntries.push(entry);
        existingHashes.add(hash);
      }
    }

    const merged = [...localEntries, ...newEntries];

    // Update local root after merge
    this.updateLocalRoot(storeKey, merged);

    this.emit('read-repair', {
      storeKey,
      newEntries: newEntries.length,
      totalEntries: merged.length,
    });

    return { merged, newEntries: newEntries.length };
  }

  // ── Status & Stats ─────────────────────────────────────────

  /**
   * Check if a sync with a peer is allowed (cooldown check).
   * @param {string} peerId
   * @returns {boolean}
   */
  canSync(peerId) {
    const lastSync = this._lastSync.get(peerId) || 0;
    return Date.now() - lastSync >= this.syncCooldown;
  }

  /**
   * Check if currently syncing.
   * @returns {boolean}
   */
  get isSyncing() {
    return this._syncing;
  }

  /**
   * Get sync statistics.
   * @returns {object}
   */
  getStats() {
    return {
      syncCount: this._syncCount,
      entriesReceived: this._entriesReceived,
      entriesSent: this._entriesSent,
      peersLastSync: Object.fromEntries(this._lastSync),
      localRoots: Object.fromEntries(this._localRoots),
    };
  }

  /**
   * Reset cooldown for a specific peer (for testing).
   * @param {string} peerId
   */
  resetCooldown(peerId) {
    this._lastSync.delete(peerId);
  }

  /**
   * Reset all state (for testing).
   */
  reset() {
    this._lastSync.clear();
    this._localRoots.clear();
    this._syncing = false;
    this._syncCount = 0;
    this._entriesReceived = 0;
    this._entriesSent = 0;
  }

  // ── Internal: Hashing ──────────────────────────────────────

  /**
   * Hash a single leaf value.
   * @private
   */
  _hashLeaf(data) {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Hash two child hashes to produce a parent hash.
   * @private
   */
  _hashPair(left, right) {
    return createHash('sha256').update(left + right).digest('hex');
  }
}
