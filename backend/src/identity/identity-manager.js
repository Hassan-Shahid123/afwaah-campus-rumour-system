// ─────────────────────────────────────────────────────────────
// Afwaah — Identity Manager
// Creates and manages Semaphore V4 identities for anonymous
// participation. Wraps @semaphore-protocol/identity.
//
// An identity consists of:
//   - privateKey: Secret key (never leaves the device)
//   - publicKey:  Baby Jubjub point derived from privateKey
//   - commitment: Poseidon hash of publicKey (goes into Merkle tree)
//
// The commitment is the student's anonymous "fingerprint" in
// the group. It proves membership without revealing identity.
// ─────────────────────────────────────────────────────────────

import { Identity } from '@semaphore-protocol/identity';

export class IdentityManager {
  /**
   * Create a new Semaphore identity.
   *
   * @param {string} [privateKey] - Optional private key. If omitted, a random one is generated.
   * @returns {Identity} Semaphore Identity instance with .privateKey, .publicKey, .commitment
   *
   * @example
   * const mgr = new IdentityManager();
   * const id = mgr.create();                    // random identity
   * const id2 = mgr.create('my-secret-key');    // deterministic identity
   * console.log(id.commitment);                 // bigint
   */
  create(privateKey) {
    if (privateKey) {
      return new Identity(privateKey);
    }
    return new Identity();
  }

  /**
   * Recreate an identity from a previously exported base64 private key.
   *
   * @param {string} exportedKey - Base64-encoded private key from identity.export()
   * @returns {Identity}
   *
   * @example
   * const exported = identity.export();          // base64 string
   * const restored = mgr.importIdentity(exported);
   * // restored.commitment === identity.commitment
   */
  importIdentity(exportedKey) {
    return Identity.import(exportedKey);
  }

  /**
   * Export an identity's private key as a portable base64 string.
   *
   * @param {Identity} identity
   * @returns {string} Base64-encoded private key
   */
  exportIdentity(identity) {
    return identity.export();
  }

  /**
   * Get the commitment (public anonymous fingerprint) of an identity.
   *
   * @param {Identity} identity
   * @returns {bigint} The identity commitment
   */
  getCommitment(identity) {
    return identity.commitment;
  }

  /**
   * Sign a message using the identity's private key.
   * Used for authenticated (but still anonymous) actions.
   *
   * @param {Identity} identity
   * @param {bigint|number|string} message
   * @returns {Signature} EdDSA-Poseidon signature
   */
  signMessage(identity, message) {
    return identity.signMessage(message);
  }

  /**
   * Verify a signature against a public key.
   *
   * @param {bigint|number|string} message
   * @param {Signature} signature
   * @param {Point} publicKey
   * @returns {boolean}
   */
  verifySignature(message, signature, publicKey) {
    return Identity.verifySignature(message, signature, publicKey);
  }
}
