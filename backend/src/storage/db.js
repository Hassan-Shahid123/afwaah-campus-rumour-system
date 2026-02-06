// ─────────────────────────────────────────────────────────────
// Afwaah — Database Manager
// Initialises Helia (IPFS) and OrbitDB, providing a single
// entry point for storage lifecycle management.
// ─────────────────────────────────────────────────────────────

import { createHelia } from 'helia';
import { createOrbitDB } from '@orbitdb/core';
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { tcp } from '@libp2p/tcp';
import { gossipsub } from '@libp2p/gossipsub';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { STORAGE } from '../config.js';

/**
 * DatabaseManager manages the Helia + OrbitDB lifecycle.
 *
 * Usage:
 *   const db = new DatabaseManager();
 *   await db.start({ libp2p });   // pass the AfwaahNode's libp2p instance
 *   const orbitdb = db.orbitdb;
 *   // ... open stores via StoreManager
 *   await db.stop();
 */
export class DatabaseManager {
  /**
   * @param {object} [options]
   * @param {string} [options.directory] — OrbitDB storage directory
   */
  constructor(options = {}) {
    /** @type {import('helia').Helia | null} */
    this.helia = null;
    /** @type {import('@orbitdb/core').OrbitDB | null} */
    this.orbitdb = null;
    this._directory = options.directory || './orbitdb';
    this._started = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Start Helia and OrbitDB.
   *
   * @param {object} options
   * @param {import('libp2p').Libp2p} [options.libp2p] — an existing libp2p instance
   *   (from AfwaahNode). If omitted, Helia creates its own.
   * @param {string} [options.directory] — override OrbitDB directory
   * @returns {Promise<void>}
   */
  async start({ libp2p, directory } = {}) {
    if (this._started) return;

    // OrbitDB v3 requires libp2p with pubsub for replication sync.
    // If no external libp2p is provided, create a minimal one with gossipsub.
    if (!libp2p) {
      this._ownLibp2p = await createLibp2p({
        addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] },
        transports: [tcp()],
        streamMuxers: [yamux()],
        connectionEncrypters: [noise()],
        services: {
          identify: identify(),
          ping: ping(),
          pubsub: gossipsub({ allowPublishToZeroTopicPeers: true, emitSelf: true }),
        },
      });
      libp2p = this._ownLibp2p;
    }

    this.helia = await createHelia({ libp2p });

    // Create OrbitDB on top of Helia
    this.orbitdb = await createOrbitDB({
      ipfs: this.helia,
      directory: directory || this._directory,
    });

    this._started = true;
  }

  /**
   * Gracefully close OrbitDB and Helia.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this._started) return;

    if (this.orbitdb) {
      await this.orbitdb.stop();
      this.orbitdb = null;
    }
    if (this.helia) {
      await this.helia.stop();
      this.helia = null;
    }
    if (this._ownLibp2p) {
      await this._ownLibp2p.stop();
      this._ownLibp2p = null;
    }

    this._started = false;
  }

  // ── Accessors ──────────────────────────────────────────────

  /** Whether the database layer is running */
  get isStarted() {
    return this._started;
  }

  /**
   * Get the OrbitDB instance (throws if not started).
   * @returns {import('@orbitdb/core').OrbitDB}
   */
  getOrbitDB() {
    if (!this._started || !this.orbitdb) {
      throw new Error('DatabaseManager is not started. Call start() first.');
    }
    return this.orbitdb;
  }

  /**
   * Get the Helia IPFS instance (throws if not started).
   * @returns {import('helia').Helia}
   */
  getHelia() {
    if (!this._started || !this.helia) {
      throw new Error('DatabaseManager is not started. Call start() first.');
    }
    return this.helia;
  }
}
