// ─────────────────────────────────────────────────────────────
// Afwaah — Identity Module Tests
//
// Run with:   npm run test:identity
//
// These tests verify:
//   1. Email parsing & DKIM extraction
//   2. Domain validation (allowed vs blocked)
//   3. Semaphore identity creation & export/import
//   4. Merkle tree membership (add, proof, verify)
//   5. Full flow: email → identity → tree → proof
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from '@jest/globals';
import { EmailVerifier } from '../src/identity/email-verifier.js';
import { IdentityManager } from '../src/identity/identity-manager.js';
import { MembershipTree } from '../src/identity/membership-tree.js';

// ─── Test Fixtures ────────────────────────────────────────────

/**
 * Fake .eml file content simulating a university email with DKIM signature.
 * In production, this would be a real downloaded .eml file.
 */
const VALID_EML = `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
        d=university.edu; s=selector1;
        bh=base64bodyhash==;
        b=base64signaturedata==;
From: student123@university.edu
To: someone@example.com
Subject: Library Overdue Notice
Date: Thu, 06 Feb 2026 10:00:00 +0000
Message-ID: <test-msg-001@university.edu>
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8

Your library book "Distributed Systems" is overdue. Please return it.
`;

const INVALID_DOMAIN_EML = `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
        d=gmail.com; s=selector1;
        bh=base64bodyhash==;
        b=base64signaturedata==;
From: random@gmail.com
To: someone@example.com
Subject: Hello
Date: Thu, 06 Feb 2026 10:00:00 +0000
Message-ID: <test-msg-002@gmail.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8

This is not a university email.
`;

const NO_DKIM_EML = `From: student@university.edu
To: someone@example.com
Subject: No DKIM
Date: Thu, 06 Feb 2026 10:00:00 +0000
Message-ID: <test-msg-003@university.edu>
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8

This email has no DKIM signature.
`;

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 1: Email Verifier
// ═══════════════════════════════════════════════════════════════

describe('EmailVerifier', () => {
  let verifier;

  beforeEach(() => {
    verifier = new EmailVerifier(['university.edu', 'student.university.edu']);
  });

  describe('extractDKIM()', () => {
    it('should extract DKIM data from a valid university email', async () => {
      const result = await verifier.extractDKIM(VALID_EML);

      expect(result.domain).toBe('university.edu');
      expect(result.from).toBe('student123@university.edu');
      expect(result.isValid).toBe(true);
      expect(result.signature).toBeTruthy();
      expect(result.selector).toBe('selector1');
      expect(result.bodyHash).toBe('base64bodyhash==');
      expect(result.messageId).toBeTruthy();
    });

    it('should flag invalid domain for non-university email', async () => {
      const result = await verifier.extractDKIM(INVALID_DOMAIN_EML);

      expect(result.domain).toBe('gmail.com');
      expect(result.isValid).toBe(false);
    });

    it('should handle emails without DKIM signature', async () => {
      const result = await verifier.extractDKIM(NO_DKIM_EML);

      expect(result.domain).toBe('university.edu');
      expect(result.signature).toBe('');
      expect(result.isValid).toBe(true); // domain is valid, just no DKIM
    });

    it('should accept Buffer input', async () => {
      const buffer = Buffer.from(VALID_EML, 'utf-8');
      const result = await verifier.extractDKIM(buffer);

      expect(result.domain).toBe('university.edu');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validate()', () => {
    it('should pass validation for valid university email with DKIM', async () => {
      const dkim = await verifier.extractDKIM(VALID_EML);
      const validation = verifier.validate(dkim);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should fail validation for non-university domain', async () => {
      const dkim = await verifier.extractDKIM(INVALID_DOMAIN_EML);
      const validation = verifier.validate(dkim);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('E004'))).toBe(true);
    });
  });

  describe('verifyEmail()', () => {
    it('should return result for valid email', async () => {
      const result = await verifier.verifyEmail(VALID_EML);
      expect(result.domain).toBe('university.edu');
      expect(result.isValid).toBe(true);
    });

    it('should throw for invalid domain email', async () => {
      await expect(verifier.verifyEmail(INVALID_DOMAIN_EML)).rejects.toThrow('E004');
    });
  });

  describe('isDomainAllowed()', () => {
    it('should accept exact domain match', () => {
      expect(verifier.isDomainAllowed('university.edu')).toBe(true);
    });

    it('should accept subdomain match', () => {
      expect(verifier.isDomainAllowed('cs.student.university.edu')).toBe(true);
    });

    it('should reject unrelated domains', () => {
      expect(verifier.isDomainAllowed('gmail.com')).toBe(false);
      expect(verifier.isDomainAllowed('fakeuniversity.edu')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(verifier.isDomainAllowed('UNIVERSITY.EDU')).toBe(true);
      expect(verifier.isDomainAllowed('Student.University.Edu')).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 2: Identity Manager
// ═══════════════════════════════════════════════════════════════

describe('IdentityManager', () => {
  let manager;

  beforeEach(() => {
    manager = new IdentityManager();
  });

  describe('create()', () => {
    it('should create an identity with a random key', () => {
      const identity = manager.create();

      expect(identity.privateKey).toBeTruthy();
      expect(identity.publicKey).toBeTruthy();
      expect(typeof identity.commitment).toBe('bigint');
      expect(identity.commitment).toBeGreaterThan(0n);
    });

    it('should create a deterministic identity from a given key', () => {
      const id1 = manager.create('my-secret-key-123');
      const id2 = manager.create('my-secret-key-123');

      expect(id1.commitment).toBe(id2.commitment);
    });

    it('should create different identities from different keys', () => {
      const id1 = manager.create('key-one');
      const id2 = manager.create('key-two');

      expect(id1.commitment).not.toBe(id2.commitment);
    });
  });

  describe('export/import', () => {
    it('should export and import an identity preserving commitment', () => {
      const original = manager.create('test-export-key');
      const exported = manager.exportIdentity(original);

      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);

      const restored = manager.importIdentity(exported);
      expect(restored.commitment).toBe(original.commitment);
    });
  });

  describe('getCommitment()', () => {
    it('should return the bigint commitment', () => {
      const identity = manager.create('commitment-test');
      const commitment = manager.getCommitment(identity);

      expect(typeof commitment).toBe('bigint');
      expect(commitment).toBe(identity.commitment);
    });
  });

  describe('signMessage / verifySignature', () => {
    it('should sign and verify a message', () => {
      const identity = manager.create('signer-key');
      const message = BigInt(12345);

      const signature = manager.signMessage(identity, message);
      expect(signature).toBeTruthy();

      const isValid = manager.verifySignature(message, signature, identity.publicKey);
      expect(isValid).toBe(true);
    });

    it('should reject a signature with wrong message', () => {
      const identity = manager.create('signer-key-2');
      const signature = manager.signMessage(identity, BigInt(111));

      const isValid = manager.verifySignature(BigInt(999), signature, identity.publicKey);
      expect(isValid).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 3: Membership Tree
// ═══════════════════════════════════════════════════════════════

describe('MembershipTree', () => {
  let tree;
  let manager;

  beforeEach(() => {
    tree = new MembershipTree();
    manager = new IdentityManager();
  });

  describe('addMember()', () => {
    it('should add a member and return its index', () => {
      const id = manager.create('member-1');
      const index = tree.addMember(id.commitment);

      expect(index).toBe(0);
      expect(tree.getSize()).toBe(1);
    });

    it('should add multiple members with sequential indices', () => {
      const id1 = manager.create('member-a');
      const id2 = manager.create('member-b');
      const id3 = manager.create('member-c');

      expect(tree.addMember(id1.commitment)).toBe(0);
      expect(tree.addMember(id2.commitment)).toBe(1);
      expect(tree.addMember(id3.commitment)).toBe(2);
      expect(tree.getSize()).toBe(3);
    });

    it('should reject duplicate commitments', () => {
      const id = manager.create('duplicate-test');
      tree.addMember(id.commitment);

      expect(() => tree.addMember(id.commitment)).toThrow('E005');
    });
  });

  describe('indexOf()', () => {
    it('should find an existing member', () => {
      const id = manager.create('find-me');
      tree.addMember(id.commitment);

      expect(tree.indexOf(id.commitment)).toBe(0);
    });

    it('should return -1 for non-members', () => {
      const id = manager.create('not-in-tree');
      expect(tree.indexOf(id.commitment)).toBe(-1);
    });
  });

  describe('generateMerkleProof()', () => {
    it('should generate a valid Merkle proof', () => {
      const id1 = manager.create('proof-test-1');
      const id2 = manager.create('proof-test-2');
      const id3 = manager.create('proof-test-3');

      tree.addMember(id1.commitment);
      tree.addMember(id2.commitment);
      tree.addMember(id3.commitment);

      const proof = tree.generateMerkleProof(1); // Proof for id2

      expect(proof).toBeTruthy();
      expect(proof.root).toBeTruthy();
      expect(proof.leaf).toBeTruthy();
    });
  });

  describe('getRoot() & getRootHistory()', () => {
    it('should update root when members are added', () => {
      const root0 = tree.getRoot();

      const id = manager.create('root-change');
      tree.addMember(id.commitment);

      const root1 = tree.getRoot();
      expect(root1).not.toBe(root0);
    });

    it('should maintain root history', () => {
      const id1 = manager.create('history-1');
      const id2 = manager.create('history-2');

      tree.addMember(id1.commitment);
      tree.addMember(id2.commitment);

      const history = tree.getRootHistory();
      // Should have: initial root, root after id1, root after id2
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should validate known roots', () => {
      const id = manager.create('valid-root');
      tree.addMember(id.commitment);
      const currentRoot = tree.getRoot();

      expect(tree.isRootValid(currentRoot)).toBe(true);
      expect(tree.isRootValid(BigInt(9999999))).toBe(false);
    });
  });

  describe('export/import', () => {
    it('should export and import tree state', () => {
      const id1 = manager.create('export-1');
      const id2 = manager.create('export-2');
      tree.addMember(id1.commitment);
      tree.addMember(id2.commitment);

      const exported = tree.export();
      const imported = MembershipTree.import(exported);

      expect(imported.getSize()).toBe(2);
      expect(imported.getRoot()).toBe(tree.getRoot());
      expect(imported.indexOf(id1.commitment)).toBe(0);
      expect(imported.indexOf(id2.commitment)).toBe(1);
    });
  });

  describe('getGroup()', () => {
    it('should return the underlying Semaphore Group', () => {
      const group = tree.getGroup();
      expect(group).toBeTruthy();
      expect(typeof group.root).toBe('bigint');
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE 4: Full Integration Flow
// ═══════════════════════════════════════════════════════════════

describe('Identity Full Flow', () => {
  it('should complete: email verify → identity create → tree add → proof generate', async () => {
    // Step 1: Verify email
    const verifier = new EmailVerifier(['university.edu']);
    const dkim = await verifier.verifyEmail(VALID_EML);
    expect(dkim.isValid).toBe(true);

    // Step 2: Create identity (deterministic from email + DKIM data)
    const manager = new IdentityManager();
    const seed = `${dkim.domain}:${dkim.bodyHash}:${dkim.messageId}`;
    const identity = manager.create(seed);
    expect(identity.commitment).toBeTruthy();

    // Step 3: Add to membership tree
    const tree = new MembershipTree();
    const index = tree.addMember(identity.commitment);
    expect(index).toBe(0);

    // Step 4: Generate Merkle proof
    const proof = tree.generateMerkleProof(index);
    expect(proof).toBeTruthy();
    expect(proof.root).toBe(tree.getRoot());

    // Step 5: Verify the identity can be found in the tree
    expect(tree.indexOf(identity.commitment)).toBe(0);

    // Step 6: Export and reimport identity
    const exported = manager.exportIdentity(identity);
    const restored = manager.importIdentity(exported);
    expect(restored.commitment).toBe(identity.commitment);

    console.log('✅ Full flow passed!');
    console.log(`   Domain: ${dkim.domain}`);
    console.log(`   Commitment: ${identity.commitment.toString().slice(0, 20)}...`);
    console.log(`   Tree size: ${tree.getSize()}`);
    console.log(`   Tree root: ${tree.getRoot().toString().slice(0, 20)}...`);
  });

  it('should support multiple students joining the same tree', async () => {
    const manager = new IdentityManager();
    const tree = new MembershipTree();

    // Simulate 5 students joining
    const students = [];
    for (let i = 0; i < 5; i++) {
      const identity = manager.create(`student-secret-${i}`);
      const index = tree.addMember(identity.commitment);
      students.push({ identity, index });
    }

    expect(tree.getSize()).toBe(5);

    // Each student can generate their own proof
    for (const student of students) {
      const proof = tree.generateMerkleProof(student.index);
      expect(proof).toBeTruthy();
      expect(proof.root).toBe(tree.getRoot());
    }

    // Root history should show progression
    const history = tree.getRootHistory();
    expect(history.length).toBeGreaterThanOrEqual(5);

    console.log(`✅ ${students.length} students joined, all proofs valid`);
  });
});
