// ─────────────────────────────────────────────────────────────
// Afwaah — Gossip Controller
// Bridges gossipsub pub/sub messages with validation and
// local storage writes. Each topic has a validation pipeline.
// ─────────────────────────────────────────────────────────────

import { PROTOCOL, NETWORK, MAX_RUMOR_LENGTH } from '../config.js';

const { TOPICS, TYPES, RUMOR_TOPICS, VOTE_VALUES, IMPACT_VALUES } = PROTOCOL;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * GossipController sits between the gossipsub layer and the application.
 * It validates incoming messages and publishes outgoing ones.
 *
 * Usage:
 *   const gc = new GossipController(afwaahNode);
 *   gc.onRumor((msg, raw)   => { ... });
 *   gc.onVote((msg, raw)    => { ... });
 *   gc.onJoin((msg, raw)    => { ... });
 *   gc.onTombstone((msg)    => { ... });
 *   gc.onSync((msg)         => { ... });
 *   gc.start();
 *   await gc.publishRumor(payload);
 */
export class GossipController {
  /**
   * @param {import('./node.js').AfwaahNode} afwaahNode — a started AfwaahNode
   */
  constructor(afwaahNode) {
    this._node = afwaahNode;
    this._handlers = new Map();    // topic → Set<callback>
    this._nullifiers = new Set();  // seen nullifier hashes for dedup
    this._started = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Attach the internal gossipsub listener.
   * All topic subscriptions are already set up by AfwaahNode.start().
   */
  start() {
    if (this._started) return;

    const pubsub = this._node.pubsub;
    pubsub.addEventListener('gossipsub:message', this._onGossipMessage.bind(this));
    this._started = true;
  }

  /**
   * Detach (best-effort — gossipsub doesn't support removeEventListener cleanly).
   */
  stop() {
    this._started = false;
  }

  // ── Handler registration ───────────────────────────────────

  /** Register a handler for validated rumor messages. */
  onRumor(handler)     { this._addHandler(TOPICS.RUMORS, handler); }

  /** Register a handler for validated vote messages. */
  onVote(handler)      { this._addHandler(TOPICS.VOTES, handler); }

  /** Register a handler for validated join messages. */
  onJoin(handler)      { this._addHandler(TOPICS.IDENTITY, handler); }

  /** Register a handler for validated tombstone messages. */
  onTombstone(handler) { this._addHandler(TOPICS.TOMBSTONE, handler); }

  /** Register a handler for sync request/response messages. */
  onSync(handler)      { this._addHandler(TOPICS.SYNC, handler); }

  // ── Publishing ─────────────────────────────────────────────

  /**
   * Publish a rumor message to the network.
   * @param {object} payload — RumorMessage.payload
   * @returns {Promise<{recipients: any[]}>}
   */
  async publishRumor(payload) {
    const msg = this._envelope(TYPES.RUMOR, payload);
    return this._publish(TOPICS.RUMORS, msg);
  }

  /**
   * Publish a vote message to the network.
   * @param {object} payload — VoteMessage.payload
   * @returns {Promise<{recipients: any[]}>}
   */
  async publishVote(payload) {
    const msg = this._envelope(TYPES.VOTE, payload);
    return this._publish(TOPICS.VOTES, msg);
  }

  /**
   * Publish a join (identity announcement) message.
   * @param {object} payload — JoinMessage.payload
   * @returns {Promise<{recipients: any[]}>}
   */
  async publishJoin(payload) {
    const msg = this._envelope(TYPES.JOIN, payload);
    return this._publish(TOPICS.IDENTITY, msg);
  }

  /**
   * Publish a tombstone (logical delete) message.
   * @param {object} payload — TombstoneMessage.payload
   * @returns {Promise<{recipients: any[]}>}
   */
  async publishTombstone(payload) {
    const msg = this._envelope(TYPES.TOMBSTONE, payload);
    return this._publish(TOPICS.TOMBSTONE, msg);
  }

  /**
   * Publish a sync request or response.
   * @param {object} payload — SyncRequest or SyncResponse payload
   * @param {'SYNC_REQUEST'|'SYNC_RESPONSE'} type
   * @returns {Promise<{recipients: any[]}>}
   */
  async publishSync(payload, type = TYPES.SYNC_REQUEST) {
    const msg = this._envelope(type, payload);
    return this._publish(TOPICS.SYNC, msg);
  }

  // ── Known nullifiers (for dedup across the session) ────────

  /**
   * Check if a nullifier has been seen before.
   * @param {string} nullifier
   * @returns {boolean}
   */
  hasNullifier(nullifier) {
    return this._nullifiers.has(nullifier);
  }

  /**
   * Record a nullifier as seen.
   * @param {string} nullifier
   */
  addNullifier(nullifier) {
    this._nullifiers.add(nullifier);
  }

  /**
   * Total unique nullifiers seen this session.
   */
  get nullifierCount() {
    return this._nullifiers.size;
  }

  // ── Internal: gossip listener ──────────────────────────────

  /**
   * Central gossipsub message handler. Parses, validates, and dispatches.
   * @private
   */
  _onGossipMessage(evt) {
    if (!this._started) return;

    const { msg } = evt.detail;
    const topic = msg.topic;
    const handlers = this._handlers.get(topic);
    if (!handlers || handlers.size === 0) return;

    // Parse
    let parsed;
    try {
      parsed = JSON.parse(decoder.decode(msg.data));
    } catch {
      // Malformed JSON → drop silently
      return;
    }

    // Basic envelope validation
    const error = this._validateEnvelope(parsed);
    if (error) {
      // Could emit an 'invalid' event in the future
      return;
    }

    // Topic-specific validation
    const payload = parsed.payload;
    let validationError = null;

    switch (topic) {
      case TOPICS.RUMORS:
        validationError = this._validateRumor(payload);
        break;
      case TOPICS.VOTES:
        validationError = this._validateVote(payload);
        break;
      case TOPICS.IDENTITY:
        validationError = this._validateJoin(payload);
        break;
      case TOPICS.TOMBSTONE:
        validationError = this._validateTombstone(payload);
        break;
      case TOPICS.SYNC:
        // Sync messages have minimal validation
        break;
      default:
        return; // unknown topic
    }

    if (validationError) return;

    // Nullifier dedup (for topics that carry nullifiers)
    const nullifier = payload?.zkProof?.nullifierHash;
    if (nullifier) {
      if (this._nullifiers.has(nullifier)) return; // duplicate
      this._nullifiers.add(nullifier);
    }

    // Dispatch to all registered handlers
    for (const handler of handlers) {
      try {
        handler(parsed, msg);
      } catch {
        // Handler errors don't crash the gossip loop
      }
    }
  }

  // ── Internal: validation ───────────────────────────────────

  /**
   * Validate the outer envelope (type, version, payload).
   * @returns {string|null} error message or null if valid
   * @private
   */
  _validateEnvelope(msg) {
    if (!msg || typeof msg !== 'object') return 'E014: not an object';
    if (msg.version !== PROTOCOL.VERSION) return `E014: bad version ${msg.version}`;
    if (!msg.type || !Object.values(TYPES).includes(msg.type)) return 'E014: unknown type';
    if (!msg.payload || typeof msg.payload !== 'object') return 'E014: missing payload';
    return null;
  }

  /**
   * Validate a RumorMessage payload.
   * Note: ZK proof cryptographic verification is done externally (by the scoring pipeline).
   * This only checks schema-level constraints.
   * @private
   */
  _validateRumor(payload) {
    if (!payload.text || typeof payload.text !== 'string') return 'E014: missing text';
    if (payload.text.length > MAX_RUMOR_LENGTH) return 'E012: rumor too long';
    if (!payload.topic || !RUMOR_TOPICS.includes(payload.topic)) return 'E014: invalid topic';
    if (!payload.zkProof) return 'E001: missing zkProof';
    if (!payload.zkProof.nullifierHash) return 'E001: missing nullifierHash';
    if (!payload.zkProof.merkleRoot) return 'E006: missing merkleRoot';
    if (typeof payload.timestamp !== 'number') return 'E014: missing timestamp';
    return null;
  }

  /**
   * Validate a VoteMessage payload.
   * @private
   */
  _validateVote(payload) {
    if (!payload.rumorId) return 'E009: missing rumorId';
    if (!VOTE_VALUES.includes(payload.vote)) return 'E013: invalid vote value';
    if (!payload.prediction || typeof payload.prediction !== 'object') return 'E008: missing prediction';

    // Check prediction sums to ~1.0
    const predSum = Object.values(payload.prediction).reduce((a, b) => a + b, 0);
    if (Math.abs(predSum - 1.0) > 0.02) return 'E008: prediction values must sum to 1.0';

    if (typeof payload.stakeAmount !== 'number' || payload.stakeAmount < 1) return 'E007: invalid stake';
    if (!payload.zkProof) return 'E001: missing zkProof';
    if (!payload.zkProof.nullifierHash) return 'E001: missing nullifierHash';
    if (typeof payload.timestamp !== 'number') return 'E014: missing timestamp';
    return null;
  }

  /**
   * Validate a JoinMessage payload.
   * @private
   */
  _validateJoin(payload) {
    if (!payload.commitment) return 'E005: missing commitment';
    if (!payload.dkimProof || typeof payload.dkimProof !== 'object') return 'E003: missing dkimProof';
    if (!payload.dkimProof.domain) return 'E004: missing domain';
    if (typeof payload.timestamp !== 'number') return 'E014: missing timestamp';
    return null;
  }

  /**
   * Validate a TombstoneMessage payload.
   * @private
   */
  _validateTombstone(payload) {
    if (!payload.rumorId) return 'E009: missing rumorId';
    if (!['retracted', 'duplicate', 'community_flagged'].includes(payload.reason)) {
      return 'E014: invalid tombstone reason';
    }
    if (!payload.zkProof) return 'E001: missing zkProof';
    if (!payload.zkProof.nullifierHash) return 'E001: missing nullifierHash';
    if (typeof payload.timestamp !== 'number') return 'E014: missing timestamp';
    return null;
  }

  // ── Internal: helpers ──────────────────────────────────────

  /**
   * Wrap a payload in a protocol envelope.
   * @private
   */
  _envelope(type, payload) {
    return {
      type,
      version: PROTOCOL.VERSION,
      payload: {
        ...payload,
        timestamp: payload.timestamp || Date.now(),
      },
    };
  }

  /**
   * Publish a JSON message to a gossipsub topic.
   * @private
   */
  async _publish(topic, msg) {
    const data = encoder.encode(JSON.stringify(msg));
    if (data.byteLength > NETWORK.MAX_MESSAGE_SIZE) {
      throw new Error(`E012: message size ${data.byteLength} exceeds max ${NETWORK.MAX_MESSAGE_SIZE}`);
    }
    return this._node.pubsub.publish(topic, data);
  }

  /**
   * Add a handler for a specific topic.
   * @private
   */
  _addHandler(topic, handler) {
    if (!this._handlers.has(topic)) {
      this._handlers.set(topic, new Set());
    }
    this._handlers.get(topic).add(handler);
  }
}
