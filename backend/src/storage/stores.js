// ─────────────────────────────────────────────────────────────
// Afwaah — OrbitDB Store Manager
// Opens and manages the four core stores:
//   rumors (events)  — append-only rumor ledger
//   votes  (events)  — append-only vote records
//   identities (kv)  — commitment → metadata
//   reputation (kv)  — nullifier-derived ID → trust score
// ─────────────────────────────────────────────────────────────

import { STORAGE, PROTOCOL } from '../config.js';

const { STORES } = STORAGE;

/**
 * StoreManager opens and exposes OrbitDB stores for the Afwaah protocol.
 *
 * Usage:
 *   const sm = new StoreManager(databaseManager.getOrbitDB());
 *   await sm.open();
 *   await sm.addRumor({ text: '...', zkProof: {...}, ... });
 *   const rumors = await sm.getAllRumors();
 *   await sm.close();
 */
export class StoreManager {
  /**
   * @param {import('@orbitdb/core').OrbitDB} orbitdb — a started OrbitDB instance
   */
  constructor(orbitdb) {
    this._orbitdb = orbitdb;

    /** @type {import('@orbitdb/core').Database | null} */
    this.rumors = null;
    /** @type {import('@orbitdb/core').Database | null} */
    this.votes = null;
    /** @type {import('@orbitdb/core').Database | null} */
    this.identities = null;
    /** @type {import('@orbitdb/core').Database | null} */
    this.reputation = null;

    this._opened = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Open all four stores.
   * @returns {Promise<void>}
   */
  async open() {
    if (this._opened) return;

    this.rumors = await this._orbitdb.open(STORES.RUMORS, {
      type: 'events',
    });

    this.votes = await this._orbitdb.open(STORES.VOTES, {
      type: 'events',
    });

    this.identities = await this._orbitdb.open(STORES.IDENTITIES, {
      type: 'keyvalue',
    });

    this.reputation = await this._orbitdb.open(STORES.REPUTATION, {
      type: 'keyvalue',
    });

    this._opened = true;
  }

  /**
   * Close all stores.
   * @returns {Promise<void>}
   */
  async close() {
    if (!this._opened) return;

    const stores = [this.rumors, this.votes, this.identities, this.reputation];
    for (const store of stores) {
      if (store) {
        try {
          await store.close();
        } catch {
          // best-effort close
        }
      }
    }

    this.rumors = null;
    this.votes = null;
    this.identities = null;
    this.reputation = null;
    this._opened = false;
  }

  /** Whether stores are open */
  get isOpen() {
    return this._opened;
  }

  // ── Rumors (EventLog) ─────────────────────────────────────

  /**
   * Append a rumor entry to the rumors event log.
   * @param {object} rumor — { text, topic, zkProof, timestamp, ... }
   * @returns {Promise<string>} hash of the new entry
   */
  async addRumor(rumor) {
    this._ensureOpen();
    return this.rumors.add({
      ...rumor,
      timestamp: rumor.timestamp || Date.now(),
    });
  }

  /**
   * Get a specific rumor by its hash.
   * @param {string} hash
   * @returns {Promise<object|undefined>}
   */
  async getRumor(hash) {
    this._ensureOpen();
    return this.rumors.get(hash);
  }

  /**
   * Get all rumors. Optionally limit the count.
   * @param {number} [limit] — max entries to return
   * @returns {Promise<Array<{hash: string, value: object}>>}
   */
  async getAllRumors(limit) {
    this._ensureOpen();
    if (limit) {
      const entries = [];
      for await (const entry of this.rumors.iterator({ amount: limit })) {
        entries.push(entry);
      }
      return entries;
    }
    return this.rumors.all();
  }

  // ── Votes (EventLog) ──────────────────────────────────────

  /**
   * Append a vote entry to the votes event log.
   * @param {object} vote — { rumorId, vote, prediction, stakeAmount, zkProof, timestamp, ... }
   * @returns {Promise<string>} hash of the new entry
   */
  async addVote(vote) {
    this._ensureOpen();
    return this.votes.add({
      ...vote,
      timestamp: vote.timestamp || Date.now(),
    });
  }

  /**
   * Get all votes. Optionally limit the count.
   * @param {number} [limit]
   * @returns {Promise<Array<{hash: string, value: object}>>}
   */
  async getAllVotes(limit) {
    this._ensureOpen();
    if (limit) {
      const entries = [];
      for await (const entry of this.votes.iterator({ amount: limit })) {
        entries.push(entry);
      }
      return entries;
    }
    return this.votes.all();
  }

  /**
   * Get votes for a specific rumor.
   * @param {string} rumorId
   * @returns {Promise<Array<{hash: string, value: object}>>}
   */
  async getVotesForRumor(rumorId) {
    this._ensureOpen();
    const allVotes = await this.votes.all();
    return allVotes.filter(entry => entry.value?.rumorId === rumorId);
  }

  // ── Identities (KVStore) ──────────────────────────────────

  /**
   * Register an identity commitment.
   * @param {string} commitment — hex or bigint string
   * @param {object} metadata — { joinedAt, merkleIndex, ... }
   * @returns {Promise<string>} hash
   */
  async registerIdentity(commitment, metadata) {
    this._ensureOpen();
    return this.identities.put(String(commitment), {
      ...metadata,
      joinedAt: metadata.joinedAt || Date.now(),
    });
  }

  /**
   * Look up identity metadata by commitment.
   * @param {string} commitment
   * @returns {Promise<object|undefined>}
   */
  async getIdentity(commitment) {
    this._ensureOpen();
    return this.identities.get(String(commitment));
  }

  /**
   * Get all registered identities.
   * @returns {Promise<Array<{key: string, value: object, hash: string}>>}
   */
  async getAllIdentities() {
    this._ensureOpen();
    return this.identities.all();
  }

  // ── Reputation (KVStore) ───────────────────────────────────

  /**
   * Set or update a user's reputation.
   * @param {string} nullifierId — derived from identity nullifier
   * @param {object} reputationData — { score, history, lastUpdated, ... }
   * @returns {Promise<string>} hash
   */
  async setReputation(nullifierId, reputationData) {
    this._ensureOpen();
    return this.reputation.put(String(nullifierId), {
      ...reputationData,
      lastUpdated: reputationData.lastUpdated || Date.now(),
    });
  }

  /**
   * Get a user's reputation data.
   * @param {string} nullifierId
   * @returns {Promise<object|undefined>}
   */
  async getReputation(nullifierId) {
    this._ensureOpen();
    return this.reputation.get(String(nullifierId));
  }

  /**
   * Get all reputation records.
   * @returns {Promise<Array<{key: string, value: object, hash: string}>>}
   */
  async getAllReputations() {
    this._ensureOpen();
    return this.reputation.all();
  }

  // ── Event listeners ────────────────────────────────────────

  /**
   * Listen for updates on a specific store.
   * @param {'rumors'|'votes'|'identities'|'reputation'} storeName
   * @param {(entry: any) => void} handler
   */
  onUpdate(storeName, handler) {
    const store = this[storeName];
    if (!store) throw new Error(`Unknown store: ${storeName}`);
    store.events.on('update', handler);
  }

  /**
   * Listen for peer join on a specific store.
   * @param {'rumors'|'votes'|'identities'|'reputation'} storeName
   * @param {(peerId: any, heads: any) => void} handler
   */
  onPeerJoin(storeName, handler) {
    const store = this[storeName];
    if (!store) throw new Error(`Unknown store: ${storeName}`);
    store.events.on('join', handler);
  }

  // ── Addresses ──────────────────────────────────────────────

  /**
   * Get the OrbitDB addresses for all stores (useful for sharing with peers).
   * @returns {object}
   */
  getAddresses() {
    this._ensureOpen();
    return {
      rumors: this.rumors.address,
      votes: this.votes.address,
      identities: this.identities.address,
      reputation: this.reputation.address,
    };
  }

  // ── Internal ───────────────────────────────────────────────

  _ensureOpen() {
    if (!this._opened) {
      throw new Error('StoreManager stores are not open. Call open() first.');
    }
  }
}
