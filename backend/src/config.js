// ─────────────────────────────────────────────────────────────
// Afwaah — Configuration Constants
// All tunable parameters for identity, scoring, networking, etc.
// ─────────────────────────────────────────────────────────────

export const IDENTITY = {
  // Allowed university email domains for ZK-Email verification
  ALLOWED_DOMAINS: ['university.edu', 'student.nust.edu.pk', 'seecs.edu.pk'],
  // Accept last N Merkle roots (allows for propagation delay)
  ROOT_HISTORY_SIZE: 10,
};

export const SCORING = {
  // BTS
  BTS_ALPHA: 1.0,                     // Weight of prediction component in BTS score
  PREDICTION_FLOOR: 0.001,            // Floor for predictions to avoid log(0)
  RBTS_THRESHOLD: 30,                 // Use RBTS below this population size

  // Reputation
  INITIAL_TRUST_SCORE: 10,
  MIN_STAKE_TO_VOTE: 1,
  MIN_STAKE_TO_POST: 5,
  MIN_STAKE_TO_DISPUTE: 3,
  SLASH_MULTIPLIER: 1.5,
  REWARD_MULTIPLIER: 1.0,
  MIN_SCORE: 0,
  MAX_SCORE: 1000,
  DECAY_RATE: 0.99,
  RECOVERY_RATE: 0.1,

  // Correlation dampening
  CORRELATION_LAMBDA: 10.0,           // Sensitivity parameter for bot detection
  CLUSTER_THRESHOLD: 0.85,            // Pearson ρ above which voters are clustered
};

export const PROTOCOL = {
  VERSION: '1.0',

  // Gossipsub topics
  TOPICS: {
    RUMORS: '/afwaah/rumors/1.0',
    VOTES: '/afwaah/votes/1.0',
    IDENTITY: '/afwaah/identity/1.0',
    TOMBSTONE: '/afwaah/tombstone/1.0',
    SYNC: '/afwaah/sync/1.0',
  },

  // Message types
  TYPES: {
    JOIN: 'JOIN',
    RUMOR: 'RUMOR',
    VOTE: 'VOTE',
    TOMBSTONE: 'TOMBSTONE',
    OFFICIAL_PROOF: 'OFFICIAL_PROOF',
    SYNC_REQUEST: 'SYNC_REQUEST',
    SYNC_RESPONSE: 'SYNC_RESPONSE',
  },

  // Allowed rumor topics
  RUMOR_TOPICS: ['administration', 'safety', 'events', 'academic', 'facilities', 'general'],

  // Vote values
  VOTE_VALUES: ['TRUE', 'FALSE', 'UNVERIFIED'],

  // Impact values for official proofs
  IMPACT_VALUES: ['CONFIRMS', 'CONTRADICTS', 'NEUTRAL'],
};

export const NETWORK = {
  // Gossipsub parameters
  GOSSIP_HEARTBEAT_INTERVAL: 1000,    // ms
  GOSSIP_FANOUT_TTL: 60000,           // ms
  GOSSIP_MESH_SIZE: 6,                // D parameter
  GOSSIP_MESH_LOW: 4,                 // D_low
  GOSSIP_MESH_HIGH: 12,               // D_high

  // Sync
  SYNC_COOLDOWN: 30000,               // ms between sync requests
  MAX_MESSAGE_SIZE: 65536,            // bytes

  // Peer scoring
  PEER_SCORE_DECAY: 0.99,
};

export const STORAGE = {
  // OrbitDB store names
  STORES: {
    RUMORS: 'afwaah.rumors',
    VOTES: 'afwaah.votes',
    IDENTITIES: 'afwaah.identities',
    REPUTATION: 'afwaah.reputation',
  },

  // Snapshotter
  SNAPSHOT_INTERVAL: 10,              // Rebuild materialized view every N operations
};

export const MAX_RUMOR_LENGTH = 2000;
