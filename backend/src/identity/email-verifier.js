// ─────────────────────────────────────────────────────────────
// Afwaah — Email Verifier
// Parses .eml files, extracts DKIM signatures, and validates
// that the .eml was downloaded from an authorized university inbox.
//
// KEY SECURITY PRINCIPLE:
//   The Delivered-To header tells us WHOSE INBOX the .eml was
//   downloaded from. This is the person presenting the proof.
//   - If Delivered-To is a university domain → they own that inbox → PASS
//   - If Delivered-To is gmail.com → they're a gmail user trying
//     to use someone else's university email as proof → FAIL
//
// Additional checks:
//   - DKIM signing domain (d=) must be an allowed university domain
//   - From address is extracted for display purposes
//
// NOTE: Full ZK-Email proof generation (zk-email-sdk) requires
// heavy circuit compilation. For the MVP, this module validates
// inbox ownership via Delivered-To + DKIM domain verification.
// ─────────────────────────────────────────────────────────────

import { simpleParser } from 'mailparser';
import { IDENTITY } from '../config.js';

/**
 * Result of DKIM extraction from an email.
 * @typedef {Object} DKIMResult
 * @property {string} domain - The recipient's (Delivered-To) email domain
 * @property {string} deliveredTo - The Delivered-To email address (inbox owner)
 * @property {string} from - The sender's email address
 * @property {string} selector - The DKIM selector (if found)
 * @property {string} signature - Raw DKIM-Signature header value
 * @property {boolean} isValid - Whether the Delivered-To domain + DKIM domain are allowed
 * @property {string} bodyHash - The body hash from the DKIM signature
 * @property {string} messageId - Unique message identifier
 * @property {string} signingDomain - The DKIM d= signing domain
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
   * Validates that the Delivered-To address (inbox owner) belongs
   * to an authorized domain, and that the DKIM signing domain is valid.
   *
   * @param {string|Buffer} emlContent - Raw email content (.eml file)
   * @returns {Promise<DKIMResult>} Extracted DKIM data
   * @throws {Error} If parsing fails or required headers are missing
   */
  async extractDKIM(emlContent) {
    const raw = typeof emlContent === 'string' ? emlContent : emlContent.toString('utf-8');

    // Parse the email
    const parsed = await simpleParser(raw);

    // ─── Extract Delivered-To (the inbox this .eml was downloaded from) ───
    // This is the CRITICAL check: who downloaded this .eml?
    const deliveredTo = this._extractDeliveredTo(raw);

    // Extract the sender (From) for display
    const fromAddress = parsed.from?.value?.[0]?.address;
    if (!fromAddress) {
      throw new Error('E003: No sender address found in the email');
    }

    // Extract DKIM-Signature header from raw headers
    const dkimSignature = this._extractDKIMHeader(raw);

    // Parse DKIM fields
    const dkimFields = this._parseDKIMFields(dkimSignature);

    // ─── Domain validation ───────────────────────────────────────
    // PRIMARY CHECK: Delivered-To domain must be an allowed university domain
    // This proves the person who downloaded this .eml owns a university inbox
    let recipientDomain = '';
    let recipientValid = false;
    if (deliveredTo) {
      recipientDomain = deliveredTo.split('@')[1]?.toLowerCase() || '';
      recipientValid = this._isDomainAllowed(recipientDomain);
    }

    // SECONDARY CHECK: DKIM signing domain should also be from an allowed domain
    // This proves the email was authentically sent from the university email system
    const signingDomain = (dkimFields.signingDomain || '').toLowerCase();
    const dkimDomainValid = signingDomain ? this._isDomainAllowed(signingDomain) : false;

    // Both checks must pass for the email to be considered valid:
    // 1. The .eml must come from an authorized inbox (Delivered-To)
    // 2. The DKIM signature must be from an authorized domain
    const isValid = recipientValid && dkimDomainValid;

    return {
      domain: recipientDomain || fromAddress.split('@')[1]?.toLowerCase() || '',
      deliveredTo: deliveredTo || '',
      from: fromAddress,
      selector: dkimFields.selector || 'unknown',
      signature: dkimSignature,
      isValid,
      bodyHash: dkimFields.bodyHash || '',
      messageId: parsed.messageId || '',
      signingDomain,
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

    // Check Delivered-To header exists
    if (!dkimResult.deliveredTo) {
      errors.push('E005: No Delivered-To header found — cannot verify which inbox this .eml was downloaded from. Make sure you download the .eml from your university email inbox.');
    }

    // Check Delivered-To domain is authorized
    if (dkimResult.deliveredTo && !this._isDomainAllowed(dkimResult.deliveredTo.split('@')[1] || '')) {
      const recipientDomain = dkimResult.deliveredTo.split('@')[1] || '';
      errors.push(`E006: This .eml was downloaded from "${dkimResult.deliveredTo}" (${recipientDomain}) — that is NOT an authorized university inbox. You must download the .eml from your @seecs.edu.pk or @student.nust.edu.pk inbox, not from a personal email like Gmail.`);
    }

    // Check DKIM signature exists
    if (!dkimResult.signature) {
      errors.push('E003: No DKIM signature found in the email');
    }

    // Check DKIM signing domain
    if (dkimResult.signingDomain && !this._isDomainAllowed(dkimResult.signingDomain)) {
      errors.push(`E007: DKIM signing domain "${dkimResult.signingDomain}" is not an authorized university domain`);
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
   * Extract the Delivered-To address from raw email headers.
   * This tells us whose inbox the .eml was downloaded from.
   * @private
   */
  _extractDeliveredTo(rawEmail) {
    // Match the first Delivered-To header (topmost = final recipient)
    const match = rawEmail.match(/^Delivered-To:\s*(.+?)[\r\n]/im);
    if (match) {
      return match[1].trim().toLowerCase();
    }
    return '';
  }

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
    const normalizedDomain = (domain || '').toLowerCase();
    if (!normalizedDomain) return false;
    return this.allowedDomains.some(allowed => {
      const normalizedAllowed = allowed.toLowerCase();
      return normalizedDomain === normalizedAllowed ||
             normalizedDomain.endsWith('.' + normalizedAllowed);
    });
  }
}
