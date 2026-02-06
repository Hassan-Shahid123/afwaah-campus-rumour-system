// ─────────────────────────────────────────────────────────────
// Afwaah — libp2p Node Factory
// Creates and manages the P2P network node with noise encryption,
// yamux muxing, gossipsub, mDNS discovery, and Kademlia DHT.
// ─────────────────────────────────────────────────────────────

import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { tcp } from '@libp2p/tcp';
import { gossipsub } from '@libp2p/gossipsub';
import { mdns } from '@libp2p/mdns';
import { kadDHT } from '@libp2p/kad-dht';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { NETWORK, PROTOCOL } from '../config.js';

/**
 * Default libp2p configuration for an Afwaah node.
 * Can be overridden via the `overrides` parameter.
 */
export function buildNodeConfig(overrides = {}) {
  const defaults = {
    addresses: {
      listen: ['/ip4/0.0.0.0/tcp/0'], // random available port
    },
    transports: [tcp()],
    streamMuxers: [yamux()],
    connectionEncrypters: [noise()],
    peerDiscovery: [
      mdns({
        interval: 10000, // query every 10 s
      }),
    ],
    services: {
      identify: identify(),
      ping: ping(),
      pubsub: gossipsub({
        emitSelf: false,
        allowPublishToZeroTopicPeers: true,
        // Gossipsub mesh tuning from config
        D: NETWORK.GOSSIP_MESH_SIZE,
        Dlo: NETWORK.GOSSIP_MESH_LOW,
        Dhi: NETWORK.GOSSIP_MESH_HIGH,
        heartbeatInterval: NETWORK.GOSSIP_HEARTBEAT_INTERVAL,
        fanoutTTL: NETWORK.GOSSIP_FANOUT_TTL,
      }),
      dht: kadDHT({
        clientMode: false,
      }),
    },
  };

  // Merge overrides (shallow — intentional for flexibility)
  return { ...defaults, ...overrides };
}

/**
 * AfwaahNode wraps a libp2p instance with Afwaah-specific lifecycle helpers.
 *
 * Usage:
 *   const node = new AfwaahNode();
 *   await node.start();
 *   // ... use node.libp2p, node.pubsub, etc.
 *   await node.stop();
 */
export class AfwaahNode {
  /**
   * @param {object} [configOverrides] — merged into the default libp2p config
   */
  constructor(configOverrides = {}) {
    /** @type {import('libp2p').Libp2p | null} */
    this.libp2p = null;
    this._configOverrides = configOverrides;
    this._started = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Create and start the libp2p node.
   * @returns {Promise<void>}
   */
  async start() {
    if (this._started) return;

    const config = buildNodeConfig(this._configOverrides);
    this.libp2p = await createLibp2p(config);
    this._started = true;

    // Subscribe to all Afwaah gossip topics
    const pubsub = this.pubsub;
    for (const topic of Object.values(PROTOCOL.TOPICS)) {
      pubsub.subscribe(topic);
    }
  }

  /**
   * Gracefully stop the libp2p node.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this._started || !this.libp2p) return;
    await this.libp2p.stop();
    this._started = false;
    this.libp2p = null;
  }

  // ── Accessors ──────────────────────────────────────────────

  /** The GossipSub pubsub service */
  get pubsub() {
    this._ensureStarted();
    return this.libp2p.services.pubsub;
  }

  /** The KadDHT service */
  get dht() {
    this._ensureStarted();
    return this.libp2p.services.dht;
  }

  /** This node's PeerId */
  get peerId() {
    this._ensureStarted();
    return this.libp2p.peerId;
  }

  /** Multiaddrs the node is listening on */
  getMultiaddrs() {
    this._ensureStarted();
    return this.libp2p.getMultiaddrs();
  }

  /** Whether the node is running */
  get isStarted() {
    return this._started;
  }

  // ── Network helpers ────────────────────────────────────────

  /**
   * Dial a remote peer by multiaddr.
   * @param {import('@multiformats/multiaddr').Multiaddr | string} multiaddr
   * @returns {Promise<import('libp2p').Connection>}
   */
  async dial(multiaddr) {
    this._ensureStarted();
    return this.libp2p.dial(multiaddr);
  }

  /**
   * Register a handler for peer discovery events.
   * @param {(peerId: any) => void} handler
   */
  onPeerDiscovery(handler) {
    this._ensureStarted();
    this.libp2p.addEventListener('peer:discovery', (evt) => {
      handler(evt.detail);
    });
  }

  /**
   * Register a handler for peer connect events.
   * @param {(peerId: any) => void} handler
   */
  onPeerConnect(handler) {
    this._ensureStarted();
    this.libp2p.addEventListener('peer:connect', (evt) => {
      handler(evt.detail);
    });
  }

  /**
   * List currently connected peers.
   * @returns {import('@libp2p/interface').PeerId[]}
   */
  getConnectedPeers() {
    this._ensureStarted();
    return this.libp2p.getPeers();
  }

  // ── Internal ───────────────────────────────────────────────

  _ensureStarted() {
    if (!this._started || !this.libp2p) {
      throw new Error('AfwaahNode is not started. Call start() first.');
    }
  }
}
