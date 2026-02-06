// ─────────────────────────────────────────────────────────────
// Afwaah — Membership Tree
// Manages the Semaphore Group (Merkle tree) that holds all
// anonymous identity commitments. Wraps @semaphore-protocol/group.
//
// The tree is the "anonymity set" — the list of all verified
// students. To post or vote, a student proves they are in this
// tree WITHOUT revealing which leaf (commitment) is theirs.
//
// Key operations:
//   - addMember(commitment)      → insert a verified student
//   - generateMerkleProof(index) → create proof for ZK-SNARK
//   - verifyMerkleProof(proof)   → validate a proof is correct
//   - getRoot()                  → current tree root hash
//   - getRootHistory()           → last N roots for delayed acceptance
// ─────────────────────────────────────────────────────────────

import { Group } from '@semaphore-protocol/group';
import { IDENTITY } from '../config.js';

export class MembershipTree {
  /**
   * Create a new membership tree, optionally pre-populated with members.
   *
   * @param {bigint[]} [existingMembers] - Array of identity commitments to bootstrap the tree
   */
  constructor(existingMembers) {
    if (existingMembers && existingMembers.length > 0) {
      this.group = new Group(existingMembers);
    } else {
      this.group = new Group();
    }

    // Track historical roots for delayed proof acceptance
    this._rootHistory = [];
    this._updateRootHistory();
  }

  /**
   * Add a new identity commitment to the tree.
   *
   * @param {bigint} commitment - The Semaphore identity commitment
   * @returns {number} The leaf index of the new member
   * @throws {Error} If commitment already exists in the tree
   */
  addMember(commitment) {
    // Check for duplicates
    const existingIndex = this.group.indexOf(commitment);
    if (existingIndex !== -1) {
      throw new Error(`E005: Identity commitment already registered at index ${existingIndex}`);
    }

    this.group.addMember(commitment);
    this._updateRootHistory();

    return this.group.size - 1; // Return the index of the newly added member
  }

  /**
   * Add multiple members at once (more efficient than one-by-one).
   *
   * @param {bigint[]} commitments
   * @returns {number} The new size of the tree
   */
  addMembers(commitments) {
    this.group.addMembers(commitments);
    this._updateRootHistory();
    return this.group.size;
  }

  /**
   * Remove a member from the tree by index.
   *
   * @param {number} index - The leaf index to remove
   */
  removeMember(index) {
    this.group.removeMember(index);
    this._updateRootHistory();
  }

  /**
   * Generate a Merkle inclusion proof for a member.
   * This proof is used inside the ZK-SNARK to prove membership.
   *
   * @param {number} leafIndex - Index of the member in the tree
   * @returns {MerkleProof} Proof object containing root, siblings, and pathIndices
   */
  generateMerkleProof(leafIndex) {
    return this.group.generateMerkleProof(leafIndex);
  }

  /**
   * Find the index of a commitment in the tree.
   *
   * @param {bigint} commitment
   * @returns {number} Index, or -1 if not found
   */
  indexOf(commitment) {
    return this.group.indexOf(commitment);
  }

  /**
   * Get the current Merkle root hash.
   *
   * @returns {bigint} The current root
   */
  getRoot() {
    return this.group.root;
  }

  /**
   * Get the tree depth.
   *
   * @returns {number}
   */
  getDepth() {
    return this.group.depth;
  }

  /**
   * Get the number of members in the tree.
   *
   * @returns {number}
   */
  getSize() {
    return this.group.size;
  }

  /**
   * Get all member commitments.
   *
   * @returns {bigint[]}
   */
  getMembers() {
    return this.group.members;
  }

  /**
   * Get the last N root hashes for delayed proof acceptance.
   * When a proof is generated against root R1 but by the time it arrives
   * the tree has moved to R2, we still accept it if R1 is in the history.
   *
   * @param {number} [n] - Number of roots to return (default from config)
   * @returns {bigint[]} Array of recent root hashes
   */
  getRootHistory(n = IDENTITY.ROOT_HISTORY_SIZE) {
    return this._rootHistory.slice(-n);
  }

  /**
   * Check if a given root is in the recent root history.
   * Used to validate incoming proofs that may reference a slightly stale root.
   *
   * @param {bigint} root
   * @returns {boolean}
   */
  isRootValid(root) {
    return this._rootHistory.some(r => r === root);
  }

  /**
   * Export the tree as a JSON string for persistence.
   *
   * @returns {string} JSON representation of the tree
   */
  export() {
    return this.group.export();
  }

  /**
   * Import a tree from a previously exported JSON string.
   *
   * @param {string} json - Exported tree data
   * @returns {MembershipTree} New tree instance
   */
  static import(json) {
    const tree = new MembershipTree();
    tree.group = Group.import(json);
    tree._updateRootHistory();
    return tree;
  }

  /**
   * Get the underlying Semaphore Group instance.
   * Needed for generateProof() which accepts a Group directly.
   *
   * @returns {Group}
   */
  getGroup() {
    return this.group;
  }

  // ─── Private helpers ────────────────────────────────────────

  /** @private */
  _updateRootHistory() {
    const currentRoot = this.group.root;
    // Only add if it's different from the last root (avoid duplicates from no-op)
    if (this._rootHistory.length === 0 || this._rootHistory[this._rootHistory.length - 1] !== currentRoot) {
      this._rootHistory.push(currentRoot);
    }
    // Keep only the configured max
    const maxHistory = IDENTITY.ROOT_HISTORY_SIZE;
    if (this._rootHistory.length > maxHistory) {
      this._rootHistory = this._rootHistory.slice(-maxHistory);
    }
  }
}
