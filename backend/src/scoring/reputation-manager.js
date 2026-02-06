// ─────────────────────────────────────────────────────────────
// Afwaah — Reputation Manager
// Manages trust scores, staking, slashing, rewards, decay,
// and recovery for all anonymous participants.
// ─────────────────────────────────────────────────────────────

import { SCORING } from '../config.js';

/**
 * ReputationManager handles the full trust-score lifecycle:
 *   - Initial score assignment
 *   - Stake validation & locking
 *   - Applying BTS/RBTS results (reward/slash)
 *   - Time-based decay
 *   - Score recovery for zeroed users
 */
export class ReputationManager {
  /**
   * @param {object} [config] — override defaults from SCORING
   */
  constructor(config = {}) {
    this.initialScore   = config.initialScore   ?? SCORING.INITIAL_TRUST_SCORE;
    this.minStakeVote   = config.minStakeVote   ?? SCORING.MIN_STAKE_TO_VOTE;
    this.minStakePost   = config.minStakePost   ?? SCORING.MIN_STAKE_TO_POST;
    this.minStakeDispute = config.minStakeDispute ?? SCORING.MIN_STAKE_TO_DISPUTE;
    this.slashMultiplier = config.slashMultiplier ?? SCORING.SLASH_MULTIPLIER;
    this.rewardMultiplier = config.rewardMultiplier ?? SCORING.REWARD_MULTIPLIER;
    this.minScore       = config.minScore       ?? SCORING.MIN_SCORE;
    this.maxScore       = config.maxScore       ?? SCORING.MAX_SCORE;
    this.decayRate      = config.decayRate      ?? SCORING.DECAY_RATE;
    this.recoveryRate   = config.recoveryRate   ?? SCORING.RECOVERY_RATE;

    /** @type {Map<string, {score: number, history: Array, stakes: Map}>} */
    this._users = new Map();
  }

  // ── User lifecycle ─────────────────────────────────────────

  /**
   * Register a new user with the initial trust score.
   * @param {string} nullifierId
   * @returns {number} initial score
   */
  register(nullifierId) {
    if (this._users.has(nullifierId)) {
      return this._users.get(nullifierId).score;
    }
    this._users.set(nullifierId, {
      score: this.initialScore,
      history: [],
      stakes: new Map(), // actionId → { amount, action }
    });
    return this.initialScore;
  }

  /**
   * Get current trust score for a user.
   * @param {string} nullifierId
   * @returns {number}
   */
  getScore(nullifierId) {
    const user = this._users.get(nullifierId);
    return user ? user.score : 0;
  }

  /**
   * Get the full user record.
   * @param {string} nullifierId
   * @returns {{score: number, history: Array, stakes: Map} | null}
   */
  getUser(nullifierId) {
    return this._users.get(nullifierId) || null;
  }

  /**
   * Get all users and their scores.
   * @returns {Map<string, number>}
   */
  getAllScores() {
    const result = new Map();
    for (const [id, user] of this._users) {
      result.set(id, user.score);
    }
    return result;
  }

  /**
   * Total registered users.
   * @returns {number}
   */
  get userCount() {
    return this._users.size;
  }

  // ── Staking ────────────────────────────────────────────────

  /**
   * Check if a user can stake a given amount for an action.
   * @param {string} nullifierId
   * @param {number} amount
   * @param {'vote'|'post'|'dispute'} action
   * @returns {boolean}
   */
  canStake(nullifierId, amount, action) {
    const user = this._users.get(nullifierId);
    if (!user) return false;

    // Check minimum stake
    const minMap = { vote: this.minStakeVote, post: this.minStakePost, dispute: this.minStakeDispute };
    const minRequired = minMap[action] ?? 0;
    if (amount < minRequired) return false;

    // Check max stake (fraction of score)
    const maxFraction = action === 'vote' ? 0.25 : 0.5;
    const maxAllowed = user.score * maxFraction;
    if (amount > maxAllowed) return false;

    // Check available balance (score minus locked stakes)
    const lockedAmount = this._getLockedAmount(nullifierId);
    if (user.score - lockedAmount < amount) return false;

    return true;
  }

  /**
   * Lock stake for a pending action.
   * @param {string} nullifierId
   * @param {number} amount
   * @param {string} actionId — unique identifier for this action (e.g. rumorId)
   * @param {'vote'|'post'|'dispute'} action
   * @returns {{actionId: string, amount: number, action: string}}
   * @throws if cannot stake
   */
  lockStake(nullifierId, amount, actionId, action) {
    if (!this.canStake(nullifierId, amount, action)) {
      throw new Error(`E007: Cannot stake ${amount} for ${action} — insufficient balance or below minimum`);
    }

    const user = this._users.get(nullifierId);
    const lock = { amount, action, lockedAt: Date.now() };
    user.stakes.set(actionId, lock);

    user.history.push({
      type: 'stake_lock',
      actionId,
      amount,
      action,
      timestamp: Date.now(),
    });

    return { actionId, amount, action };
  }

  /**
   * Release a stake lock (e.g. on scoring completion).
   * @param {string} nullifierId
   * @param {string} actionId
   * @returns {boolean}
   */
  releaseLock(nullifierId, actionId) {
    const user = this._users.get(nullifierId);
    if (!user) return false;
    return user.stakes.delete(actionId);
  }

  // ── Scoring: Apply BTS/RBTS results ───────────────────────

  /**
   * Apply BTS/RBTS results to update all voters' reputations.
   *
   * @param {{voterScores: Map<string, number>}} btsResult — from BTS/RBTSEngine.calculate()
   * @param {string} rumorId — the scored rumor
   * @param {Map<string, number>} [stakeAmounts] — nullifier → staked amount (optional)
   * @returns {{rewards: Map<string, number>, slashes: Map<string, number>}}
   */
  applyScores(btsResult, rumorId, stakeAmounts = new Map()) {
    const rewards = new Map();
    const slashes = new Map();

    for (const [nullifier, score] of btsResult.voterScores) {
      // Auto-register unknown users
      if (!this._users.has(nullifier)) this.register(nullifier);

      const stake = stakeAmounts.get(nullifier) || 1;

      if (score > 0) {
        // Reward
        const reward = score * stake * this.rewardMultiplier;
        this._adjustScore(nullifier, reward, 'reward', rumorId);
        rewards.set(nullifier, reward);
      } else if (score < 0) {
        // Slash
        const penalty = Math.abs(score) * stake * this.slashMultiplier;
        this._adjustScore(nullifier, -penalty, 'slash', rumorId);
        slashes.set(nullifier, penalty);
      }
      // score === 0 → no change

      // Release stake lock for this rumor
      this.releaseLock(nullifier, rumorId);
    }

    return { rewards, slashes };
  }

  /**
   * Apply a group penalty for coordinated dishonest voting.
   * penalty_group = basePenalty × (1 + log2(|G|))
   *
   * @param {string[]} groupNullifiers — the clustered voters
   * @param {number} basePenalty — base penalty per voter
   * @param {string} rumorId
   * @returns {Map<string, number>} nullifier → actual penalty applied
   */
  applyGroupSlash(groupNullifiers, basePenalty, rumorId) {
    const groupSize = groupNullifiers.length;
    const multiplier = 1 + Math.log2(Math.max(groupSize, 1));
    const totalPenalty = basePenalty * multiplier;

    const slashes = new Map();
    for (const nul of groupNullifiers) {
      if (!this._users.has(nul)) this.register(nul);
      this._adjustScore(nul, -totalPenalty, 'group_slash', rumorId);
      slashes.set(nul, totalPenalty);
    }

    return slashes;
  }

  // ── Decay & Recovery ───────────────────────────────────────

  /**
   * Apply time-based decay to all users.
   * score *= decayRate
   * @param {number} [rate] — override the default decay rate
   */
  applyDecay(rate) {
    const dr = rate ?? this.decayRate;
    for (const [id, user] of this._users) {
      const oldScore = user.score;
      user.score = Math.max(this.minScore, user.score * dr);
      if (oldScore !== user.score) {
        user.history.push({
          type: 'decay',
          delta: user.score - oldScore,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Apply recovery for users at or near zero.
   * Users below initialScore get a small boost.
   * @param {number} [rate] — override the default recovery rate
   */
  applyRecovery(rate) {
    const rr = rate ?? this.recoveryRate;
    for (const [id, user] of this._users) {
      if (user.score < this.initialScore) {
        const oldScore = user.score;
        user.score = Math.min(
          this.initialScore,
          user.score + rr,
        );
        user.history.push({
          type: 'recovery',
          delta: user.score - oldScore,
          timestamp: Date.now(),
        });
      }
    }
  }

  // ── Bulk state (for persistence) ───────────────────────────

  /**
   * Export all user data (for persistence).
   * @returns {Array<{nullifierId: string, score: number, history: Array}>}
   */
  export() {
    const data = [];
    for (const [id, user] of this._users) {
      data.push({
        nullifierId: id,
        score: user.score,
        history: [...user.history],
      });
    }
    return data;
  }

  /**
   * Import user data (from persistence).
   * @param {Array<{nullifierId: string, score: number, history?: Array}>} data
   */
  import(data) {
    for (const entry of data) {
      this._users.set(entry.nullifierId, {
        score: entry.score,
        history: entry.history || [],
        stakes: new Map(),
      });
    }
  }

  // ── Internal ───────────────────────────────────────────────

  /**
   * Adjust a user's score, clamping to [minScore, maxScore].
   * @private
   */
  _adjustScore(nullifierId, delta, type, actionId) {
    const user = this._users.get(nullifierId);
    if (!user) return;

    const oldScore = user.score;
    user.score = Math.max(this.minScore, Math.min(this.maxScore, user.score + delta));

    user.history.push({
      type,
      delta: user.score - oldScore,
      actionId,
      timestamp: Date.now(),
    });
  }

  /**
   * Total locked (staked) amount for a user.
   * @private
   */
  _getLockedAmount(nullifierId) {
    const user = this._users.get(nullifierId);
    if (!user) return 0;
    let total = 0;
    for (const lock of user.stakes.values()) {
      total += lock.amount;
    }
    return total;
  }
}
