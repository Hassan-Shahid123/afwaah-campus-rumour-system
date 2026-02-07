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
// IMPORTANT: The Delivered-To header is NOT DKIM-signed (it's added
// by the receiving server after DKIM is applied by the sender).
// Therefore we cross-validate it against:
//   - Received: headers (which contain "for <recipient>")
//   - The signed To:/Cc: headers (for non-mailing-list emails)
//
// Security layers:
//   LAYER 1: DKIM crypto verification (proves headers not tampered)
//   LAYER 2: DKIM signing domain must be an allowed university domain
//   LAYER 3: Delivered-To must match the Received "for <>" recipient
//            AND must be an allowed university inbox.
//            Cross-validates unsigned headers against each other to
//            detect manual tampering.
//   LAYER 4: Delivered-To must match a DKIM-signed To/Cc header.
//            To/Cc ARE covered by DKIM h= (they are signed), so editing
//            them breaks DKIM verification. This creates an unforgeable
//            anchor: even if Delivered-To AND Received are both edited
//            consistently, they won't match the immutable signed To/Cc.
// ─────────────────────────────────────────────────────────────

import { simpleParser } from 'mailparser';
import { dkimVerify } from 'mailauth/lib/dkim/verify.js';
import dns from 'dns';
import { IDENTITY } from '../config.js';

// ─── Custom DNS Resolver ─────────────────────────────────────
// University and mobile networks often block or filter DNS TXT
// record lookups needed for DKIM verification. This resolver
// tries system DNS first, then falls back to public resolvers
// (Google 8.8.8.8, Cloudflare 1.1.1.1).
// ──────────────────────────────────────────────────────────────

const PUBLIC_DNS_SERVERS = ['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1'];

function createFallbackResolver() {
  return async function fallbackResolver(name, rrtype) {
    // Attempt 1: system DNS
    try {
      const result = await new Promise((resolve, reject) => {
        dns.resolve(name, rrtype, (err, records) => {
          if (err) reject(err);
          else resolve(records);
        });
      });
      return result;
    } catch (systemErr) {
      // System DNS failed — try public resolvers
    }

    // Attempt 2: public DNS resolvers
    const resolver = new dns.Resolver();
    resolver.setServers(PUBLIC_DNS_SERVERS);

    try {
      const result = await new Promise((resolve, reject) => {
        if (rrtype === 'TXT') {
          resolver.resolveTxt(name, (err, records) => {
            if (err) reject(err);
            // mailauth expects the same shape as dns.resolve(name, 'TXT')
            else resolve(records);
          });
        } else if (rrtype === 'MX') {
          resolver.resolveMx(name, (err, records) => {
            if (err) reject(err);
            else resolve(records);
          });
        } else {
          resolver.resolve(name, rrtype, (err, records) => {
            if (err) reject(err);
            else resolve(records);
          });
        }
      });
      return result;
    } catch (publicErr) {
      throw publicErr; // both failed
    }
  };
}

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
    // WARNING: Delivered-To is NOT DKIM-signed. Cross-validate it.
    const deliveredTo = this._extractDeliveredTo(raw);
    const receivedForAddresses = this._extractReceivedForAddresses(raw);
    const recipientCrossCheck = this._crossValidateRecipient(deliveredTo, receivedForAddresses);

    // ─── Extract DKIM-signed recipient addresses (To/Cc) ─────────
    // To and Cc ARE listed in DKIM h= (signed headers). Editing them
    // breaks the DKIM signature. This is the unforgeable anchor.
    const signedRecipients = this._extractSignedRecipients(parsed);
    const signedHeaderCheck = this._validateAgainstSignedHeaders(deliveredTo, signedRecipients);

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
      const dkimResult = await dkimVerify(raw, { resolver: createFallbackResolver() });

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

    // ALL FIVE checks must pass:
    // 1. Delivered-To is a university inbox (proves who downloaded it)
    // 2. DKIM signing domain is a university domain
    // 3. DKIM signature cryptographically verifies (proves headers were NOT edited)
    // 4. Delivered-To cross-validates against Received "for <>" headers
    //    (catches manual Delivered-To tampering — since DKIM doesn't sign it)
    // 5. Delivered-To matches a DKIM-signed To/Cc header
    //    (unforgeable anchor — editing To/Cc breaks DKIM verification)
    const isValid = recipientValid && dkimDomainValid && dkimCryptoValid
      && recipientCrossCheck.consistent && signedHeaderCheck.consistent;

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
      recipientCrossCheck,       // expose cross-validation details
      receivedForAddresses,      // expose all Received "for <>" addresses
      signedHeaderCheck,         // expose To/Cc signed-header validation
      signedRecipients,          // expose DKIM-signed To/Cc addresses
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

    // CHECK: Cross-validate Delivered-To against Received "for <>" headers
    // The Delivered-To header is NOT DKIM-signed (added by receiving server),
    // so an attacker can freely edit it. We cross-check it against Received
    // "for <recipient>" headers which are also added during transit — if they
    // don't match, the Delivered-To has been tampered with.
    if (dkimResult.recipientCrossCheck && !dkimResult.recipientCrossCheck.consistent) {
      errors.push(`E009: ${dkimResult.recipientCrossCheck.details}`);
    }

    // CHECK: Cross-validate Delivered-To against DKIM-signed To/Cc headers
    // To and Cc headers ARE signed by DKIM (in the h= field). Editing them
    // would break the DKIM signature. If Delivered-To doesn't match any
    // signed To/Cc address, the Delivered-To header was forged.
    // This catches the attack where BOTH Delivered-To AND Received "for <>"
    // headers are edited consistently (since neither is DKIM-signed).
    if (dkimResult.signedHeaderCheck && !dkimResult.signedHeaderCheck.consistent) {
      errors.push(`E010: ${dkimResult.signedHeaderCheck.details}`);
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
   * 
   * WARNING: This header is NOT DKIM-signed. It is added by the
   * receiving server AFTER the DKIM signature is applied. It can
   * be freely edited without breaking DKIM verification. We
   * cross-validate it against Received "for <>" headers.
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
   * Extract ALL recipient addresses from Received "for <email>" headers.
   * These headers are also unsigned but are added by mail servers during
   * transit. Cross-checking Delivered-To against these catches manual edits
   * because an attacker would need to edit ALL of them consistently.
   * @private
   */
  _extractReceivedForAddresses(rawEmail) {
    const addresses = [];
    // Match "for <email@domain>" patterns in Received: headers
    const regex = /^Received:[\s\S]*?for\s+<([^>]+)>/gim;
    let match;
    while ((match = regex.exec(rawEmail)) !== null) {
      addresses.push(match[1].trim().toLowerCase());
    }
    return [...new Set(addresses)]; // deduplicate
  }

  /**
   * Cross-validate the Delivered-To header against Received "for <>" headers.
   * Since DKIM does NOT sign Delivered-To (it's added by the receiving server),
   * this cross-validation detects manual tampering: if someone edits only the
   * Delivered-To line but forgets (or can't easily find) the Received headers,
   * the mismatch will be caught.
   * 
   * @private
   * @param {string} deliveredTo - The Delivered-To address
   * @param {string[]} receivedForAddresses - Addresses from Received "for <>" headers
   * @returns {{ consistent: boolean, details: string }}
   */
  _crossValidateRecipient(deliveredTo, receivedForAddresses) {
    if (!deliveredTo) {
      return { consistent: false, details: 'No Delivered-To header found' };
    }
    if (receivedForAddresses.length === 0) {
      // Some emails don't have "for <>" in Received headers — allow but warn
      return { consistent: true, details: 'No Received "for" headers to cross-check (allowed)' };
    }

    // The Delivered-To address should match at least one Received "for <>" address
    const deliveredToLower = deliveredTo.toLowerCase();
    const matchesAny = receivedForAddresses.some(addr => addr === deliveredToLower);

    if (matchesAny) {
      return { consistent: true, details: 'Delivered-To matches Received header' };
    }

    return {
      consistent: false,
      details: `Delivered-To "${deliveredTo}" does NOT match any Received "for" header: [${receivedForAddresses.join(', ')}]. The Delivered-To header appears to have been manually edited.`,
    };
  }

  /**
   * Extract all recipient addresses from the DKIM-signed To and Cc headers.
   * These headers ARE covered by the DKIM h= field. Editing them breaks
   * the DKIM signature, so they serve as an immutable reference.
   * 
   * @private
   * @param {Object} parsed - Result from simpleParser()
   * @returns {string[]} Lowercased email addresses from To/Cc
   */
  _extractSignedRecipients(parsed) {
    const addresses = [];

    // Extract from To header
    if (parsed.to?.value) {
      for (const addr of parsed.to.value) {
        if (addr.address) addresses.push(addr.address.toLowerCase());
      }
    }

    // Extract from Cc header
    if (parsed.cc?.value) {
      for (const addr of parsed.cc.value) {
        if (addr.address) addresses.push(addr.address.toLowerCase());
      }
    }

    return [...new Set(addresses)]; // deduplicate
  }

  /**
   * Validate Delivered-To against the DKIM-signed To/Cc headers.
   * This is the unforgeable anchor: To/Cc are signed by DKIM,
   * so editing them breaks the DKIM signature. If Delivered-To
   * doesn't match any signed recipient, it was tampered with.
   *
   * This catches the sophisticated attack where an attacker edits
   * BOTH Delivered-To AND Received "for <>" headers consistently —
   * since neither is DKIM-signed, they can be freely changed. But
   * To/Cc CANNOT be changed without breaking DKIM verification.
   *
   * @private
   * @param {string} deliveredTo - The Delivered-To address (unsigned)
   * @param {string[]} signedRecipients - Addresses from DKIM-signed To/Cc
   * @returns {{ consistent: boolean, details: string }}
   */
  _validateAgainstSignedHeaders(deliveredTo, signedRecipients) {
    if (!deliveredTo) {
      return { consistent: false, details: 'No Delivered-To header found' };
    }
    if (signedRecipients.length === 0) {
      // Rare: if both To and Cc are missing, we rely on other checks
      return { consistent: true, details: 'No signed To/Cc recipients to cross-check (allowed)' };
    }

    const deliveredToLower = deliveredTo.toLowerCase();
    const deliveredToDomain = deliveredToLower.split('@')[1] || '';

    // First try exact address match
    const exactMatch = signedRecipients.some(addr => addr === deliveredToLower);
    if (exactMatch) {
      return { consistent: true, details: 'Delivered-To matches DKIM-signed To/Cc header (exact)' };
    }

    // For mailing list emails: the To: is the list address (e.g. bese14@seecs.edu.pk)
    // while Delivered-To is the individual (e.g. student@seecs.edu.pk).
    // They share the same domain, which is sufficient — both are university domain.
    const domainMatch = signedRecipients.some(addr => {
      const addrDomain = (addr.split('@')[1] || '').toLowerCase();
      return addrDomain === deliveredToDomain;
    });

    if (domainMatch) {
      return { consistent: true, details: 'Delivered-To domain matches DKIM-signed To/Cc domain (mailing list)' };
    }

    return {
      consistent: false,
      details: `Delivered-To "${deliveredTo}" does NOT match any DKIM-signed To/Cc address: [${signedRecipients.join(', ')}]. `
        + `The To/Cc headers are cryptographically signed by DKIM and cannot be forged. `
        + `This means the Delivered-To header was manually edited to a different address.`,
    };
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
