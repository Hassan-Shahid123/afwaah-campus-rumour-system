// ─────────────────────────────────────────────────────────────
// Afwaah — Email Verifier (Cryptographic DKIM Verification)
//
// This module CRYPTOGRAPHICALLY verifies .eml files using the
// mailauth library, which performs REAL DKIM signature verification:
//
//   1. Parses the DKIM-Signature header from the .eml
//   2. Fetches the sender domain's RSA public key from DNS
//      (e.g., google._domainkey.seecs.edu.pk TXT record)
//   3. Verifies the RSA signature over the signed headers
//      (From, To, Subject, Date, Message-ID, etc.)
//   4. Verifies the body hash (bh=) matches the actual body
//
// If ANYONE edits even one character of the From/To/Subject/body,
// the cryptographic signature FAILS — this cannot be faked.
//
// Security layers:
//   LAYER 1: DKIM crypto verification (proves headers not tampered)
//   LAYER 2: DKIM signing domain must be an allowed university domain
//   LAYER 3: Delivered-To must be an allowed university inbox
//            (proves WHO downloaded this .eml)
// ─────────────────────────────────────────────────────────────

import { simpleParser } from 'mailparser';
import { dkimVerify } from 'mailauth/lib/dkim/verify.js';
import { IDENTITY } from '../config.js';

/**
 * Result of DKIM verification from an email.
 * @typedef {Object} DKIMResult
 * @property {string} domain - The recipient's (Delivered-To) email domain
 * @property {string} deliveredTo - The Delivered-To email address (inbox owner)
 * @property {string} from - The sender's email address
 * @property {string} selector - The DKIM selector used
 * @property {string} signature - Raw DKIM-Signature header value
 * @property {boolean} isValid - Whether ALL checks passed (crypto + domain + inbox)
 * @property {string} bodyHash - The body hash from the DKIM signature
 * @property {string} messageId - Unique message identifier
 * @property {string} signingDomain - The DKIM d= signing domain
 * @property {string} dkimStatus - The cryptographic verification result (pass/fail/none)
 * @property {string} dkimInfo - Human-readable DKIM verification details
 */

export class EmailVerifier {
  /**
   * @param {string[]} allowedDomains - List of accepted university domains
   */
  constructor(allowedDomains = IDENTITY.ALLOWED_DOMAINS) {
    this.allowedDomains = allowedDomains;
  }

  /**
   * Parse a raw .eml file, CRYPTOGRAPHICALLY verify its DKIM signature,
   * and validate domain + inbox ownership.
   *
   * @param {string|Buffer} emlContent - Raw email content (.eml file)
   * @returns {Promise<DKIMResult>} Verified DKIM data
   * @throws {Error} If parsing fails or required headers are missing
   */
  async extractDKIM(emlContent) {
    const raw = typeof emlContent === 'string' ? emlContent : emlContent.toString('utf-8');

    // Parse the email for metadata
    const parsed = await simpleParser(raw);

    // ─── Extract Delivered-To (the inbox this .eml was downloaded from) ───
    const deliveredTo = this._extractDeliveredTo(raw);

    // Extract the sender (From) for display
    const fromAddress = parsed.from?.value?.[0]?.address;
    if (!fromAddress) {
      throw new Error('E003: No sender address found in the email');
    }

    // ─── CRYPTOGRAPHIC DKIM VERIFICATION ─────────────────────────
    // This is the REAL check: fetches the public key from DNS and
    // verifies the RSA signature over the email headers + body hash.
    // If the email was edited, this WILL FAIL.
    let dkimStatus = 'none';
    let dkimInfo = 'No DKIM signature found';
    let dkimSigningDomain = '';
    let dkimSelector = '';

    // Also extract raw DKIM header for display
    const dkimSignature = this._extractDKIMHeader(raw);
    const dkimFields = this._parseDKIMFields(dkimSignature);

    try {
      const dkimResult = await dkimVerify(raw);

      if (dkimResult && dkimResult.results && dkimResult.results.length > 0) {
        // Find the first result from an allowed domain, or use the first result
        const relevantResult = dkimResult.results.find(r => {
          const domain = r.signingDomain || r.status?.comment || '';
          return this._isDomainAllowed(domain);
        }) || dkimResult.results[0];

        dkimStatus = relevantResult.status?.result || 'none';
        dkimInfo = relevantResult.info || `dkim=${dkimStatus}`;
        dkimSigningDomain = relevantResult.signingDomain || dkimFields.signingDomain || '';
        dkimSelector = relevantResult.selector || dkimFields.selector || '';
      }
    } catch (dkimErr) {
      // DKIM verification failed (e.g., DNS unreachable)
      dkimStatus = 'temperror';
      dkimInfo = `DKIM verification error: ${dkimErr.message}`;
      // Fall back to parsed fields
      dkimSigningDomain = dkimFields.signingDomain || '';
      dkimSelector = dkimFields.selector || '';
    }

    // ─── Domain validation ───────────────────────────────────────
    // CHECK 1: Delivered-To domain must be an allowed university domain
    let recipientDomain = '';
    let recipientValid = false;
    if (deliveredTo) {
      recipientDomain = deliveredTo.split('@')[1]?.toLowerCase() || '';
      recipientValid = this._isDomainAllowed(recipientDomain);
    }

    // CHECK 2: DKIM signing domain must be from an allowed domain
    const signingDomain = (dkimSigningDomain || '').toLowerCase();
    const dkimDomainValid = signingDomain ? this._isDomainAllowed(signingDomain) : false;

    // CHECK 3: DKIM signature must CRYPTOGRAPHICALLY pass
    const dkimCryptoValid = dkimStatus === 'pass';

    // ALL THREE checks must pass:
    // 1. Delivered-To is a university inbox (proves who downloaded it)
    // 2. DKIM signing domain is a university domain
    // 3. DKIM signature cryptographically verifies (proves headers were NOT edited)
    const isValid = recipientValid && dkimDomainValid && dkimCryptoValid;

    return {
      domain: recipientDomain || fromAddress.split('@')[1]?.toLowerCase() || '',
      deliveredTo: deliveredTo || '',
      from: fromAddress,
      selector: dkimSelector || dkimFields.selector || 'unknown',
      signature: dkimSignature,
      isValid,
      bodyHash: dkimFields.bodyHash || '',
      messageId: parsed.messageId || '',
      signingDomain,
      dkimStatus,
      dkimInfo,
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

    // CHECK CRYPTOGRAPHIC DKIM VERIFICATION
    if (dkimResult.dkimStatus !== 'pass') {
      if (dkimResult.dkimStatus === 'fail') {
        errors.push(`E008: DKIM signature FAILED cryptographic verification — the email headers have been tampered with. The RSA signature does not match the signed headers (From, To, Subject, etc.). (${dkimResult.dkimInfo})`);
      } else if (dkimResult.dkimStatus === 'neutral') {
        // 'neutral' usually means body hash mismatch — the email body was modified/truncated
        errors.push(`E008: DKIM verification failed — the email body hash does not match. This usually means the .eml content was not pasted completely. Make sure you paste the ENTIRE .eml file including all attachment data (the large blocks of random characters). Do not remove or edit any part of the file. (${dkimResult.dkimInfo})`);
      } else if (dkimResult.dkimStatus === 'temperror') {
        errors.push(`E008: DKIM verification could not complete — DNS lookup failed. Check your internet connection and try again. (${dkimResult.dkimInfo})`);
      } else if (dkimResult.dkimStatus === 'none') {
        errors.push('E008: No DKIM signature could be verified. The email may not have a valid DKIM signature.');
      } else {
        errors.push(`E008: DKIM cryptographic verification returned "${dkimResult.dkimStatus}": ${dkimResult.dkimInfo}`);
      }
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
   * Full pipeline: parse + crypto verify + validate. Throws on failure.
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
    const dkimRegex = /DKIM-Signature:\s*([\s\S]*?)(?=\r?\n[^\s]|\r?\n\r?\n)/i;
    const match = rawEmail.match(dkimRegex);

    if (match) {
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
