// ─────────────────────────────────────────────────────────────
// Afwaah — Email Verifier
// Parses .eml files, extracts DKIM signatures, and validates
// that the email originates from an allowed university domain.
//
// NOTE: Full ZK-Email proof generation (zk-email-sdk) requires
// heavy circuit compilation. For the MVP, this module:
//   1. Parses the .eml and extracts DKIM headers
//   2. Validates the domain is in the allowed list
//   3. Returns a structured DKIM result for identity creation
//
// ZK proof wrapping will be added when zk-email circuits are
// compiled and integrated.
// ─────────────────────────────────────────────────────────────

import { simpleParser } from 'mailparser';
import { IDENTITY } from '../config.js';

/**
 * Result of DKIM extraction from an email.
 * @typedef {Object} DKIMResult
 * @property {string} domain - The sender's email domain
 * @property {string} from - The sender's email address
 * @property {string} selector - The DKIM selector (if found)
 * @property {string} signature - Raw DKIM-Signature header value
 * @property {boolean} isValid - Whether the domain is in the allowed list
 * @property {string} bodyHash - The body hash from the DKIM signature
 * @property {string} messageId - Unique message identifier
 */

export class EmailVerifier {
  /**
   * @param {string[]} allowedDomains - List of accepted university domains
   */
  constructor(allowedDomains = IDENTITY.ALLOWED_DOMAINS) {
    this.allowedDomains = allowedDomains;
  }

  /**
   * Parse a raw .eml file and extract DKIM signature data.
   *
   * @param {string|Buffer} emlContent - Raw email content (.eml file)
   * @returns {Promise<DKIMResult>} Extracted DKIM data
   * @throws {Error} If parsing fails or no DKIM signature is found
   */
  async extractDKIM(emlContent) {
    const raw = typeof emlContent === 'string' ? emlContent : emlContent.toString('utf-8');

    // Parse the email
    const parsed = await simpleParser(raw);

    // Extract the sender domain
    const fromAddress = parsed.from?.value?.[0]?.address;
    if (!fromAddress) {
      throw new Error('E003: No sender address found in the email');
    }

    const domain = fromAddress.split('@')[1]?.toLowerCase();
    if (!domain) {
      throw new Error('E003: Could not extract domain from sender address');
    }

    // Extract DKIM-Signature header from raw headers
    const dkimSignature = this._extractDKIMHeader(raw);

    // Parse DKIM fields
    const dkimFields = this._parseDKIMFields(dkimSignature);

    // Validate domain against allowed list
    const isValid = this._isDomainAllowed(domain);

    return {
      domain,
      from: fromAddress,
      selector: dkimFields.selector || 'unknown',
      signature: dkimSignature,
      isValid,
      bodyHash: dkimFields.bodyHash || '',
      messageId: parsed.messageId || '',
    };
  }

  /**
   * Validate that a DKIM result passes all checks for identity creation.
   *
   * @param {DKIMResult} dkimResult - Result from extractDKIM()
   * @returns {{ valid: boolean, errors: string[] }} Validation result
   */
  validate(dkimResult) {
    const errors = [];

    if (!dkimResult.isValid) {
      errors.push(`E004: Domain "${dkimResult.domain}" is not in the allowed university domains list`);
    }

    if (!dkimResult.signature) {
      errors.push('E003: No DKIM signature found in the email');
    }

    if (!dkimResult.from) {
      errors.push('E003: No sender address found');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Full pipeline: parse + validate. Throws on failure.
   *
   * @param {string|Buffer} emlContent - Raw .eml file content
   * @returns {Promise<DKIMResult>} Validated DKIM result
   * @throws {Error} If validation fails
   */
  async verifyEmail(emlContent) {
    const dkimResult = await this.extractDKIM(emlContent);
    const validation = this.validate(dkimResult);

    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    return dkimResult;
  }

  /**
   * Check if a domain is in the allowed university domains list.
   *
   * @param {string} domain
   * @returns {boolean}
   */
  isDomainAllowed(domain) {
    return this._isDomainAllowed(domain);
  }

  // ─── Private helpers ────────────────────────────────────────

  /**
   * Extract the DKIM-Signature header from raw email text.
   * @private
   */
  _extractDKIMHeader(rawEmail) {
    // Match the DKIM-Signature header, which may span multiple lines
    // (continuation lines start with whitespace)
    const dkimRegex = /DKIM-Signature:\s*([\s\S]*?)(?=\r?\n[^\s]|\r?\n\r?\n)/i;
    const match = rawEmail.match(dkimRegex);

    if (match) {
      // Clean up: remove line breaks and extra whitespace
      return match[1].replace(/\r?\n\s+/g, ' ').trim();
    }

    return '';
  }

  /**
   * Parse individual fields from a DKIM-Signature value.
   * @private
   */
  _parseDKIMFields(dkimSignature) {
    if (!dkimSignature) return {};

    const fields = {};
    const parts = dkimSignature.split(';');

    for (const part of parts) {
      const [key, ...valueParts] = part.split('=');
      if (key && valueParts.length > 0) {
        const k = key.trim().toLowerCase();
        const v = valueParts.join('=').trim();

        if (k === 's') fields.selector = v;
        if (k === 'bh') fields.bodyHash = v;
        if (k === 'b') fields.signatureData = v;
        if (k === 'd') fields.signingDomain = v;
      }
    }

    return fields;
  }

  /**
   * Check domain against allowed list (supports subdomains).
   * @private
   */
  _isDomainAllowed(domain) {
    const normalizedDomain = domain.toLowerCase();
    return this.allowedDomains.some(allowed => {
      const normalizedAllowed = allowed.toLowerCase();
      return normalizedDomain === normalizedAllowed ||
             normalizedDomain.endsWith('.' + normalizedAllowed);
    });
  }
}
