# 🔐 Phase 1 — Identity & Membership

This module lets students create **anonymous ZK identities**, verify their university email via DKIM, and register in a **Merkle membership tree** for zero-knowledge proof of membership.

---

## Concepts

| Concept | What it is |
|---------|------------|
| **Semaphore Identity** | An EdDSA-Poseidon keypair. The `commitment` (Poseidon hash) is public; the `privateKey` never leaves the device. |
| **DKIM Verification** | Emails contain DKIM signatures. We parse the `.eml` file to prove the student owns a `@university.edu` address without revealing the address. |
| **Membership Tree** | A Merkle tree (LeanIMT) of all verified identity commitments. ZK proofs show "I'm in this tree" without revealing which leaf. |

---

## Quick Start

All examples use ES Modules. Create a file (e.g., `demo-identity.js`) inside the `backend/` folder:

```js
// demo-identity.js
import { IdentityManager } from './src/identity/identity-manager.js';
import { MembershipTree } from './src/identity/membership-tree.js';
```

Run with:
```bash
node demo-identity.js
```

---

## Step 1 — Create Identities

```js
import { IdentityManager } from './src/identity/identity-manager.js';

const mgr = new IdentityManager();

// Create a random identity (for production)
const alice = mgr.create();
console.log('Alice commitment:', alice.commitment);   // bigint
console.log('Alice public key:', alice.publicKey);     // [bigint, bigint]
// alice.privateKey exists but NEVER share it

// Create a deterministic identity (for testing)
const bob = mgr.create('bobs-secret-passphrase');
const bob2 = mgr.create('bobs-secret-passphrase');
console.log('Deterministic:', bob.commitment === bob2.commitment);  // true
```

### What you get

| Property | Type | Description |
|----------|------|-------------|
| `identity.privateKey` | `string` | Secret key — never leaves the device |
| `identity.publicKey` | `[bigint, bigint]` | Baby Jubjub point |
| `identity.commitment` | `bigint` | Poseidon hash — goes into the Merkle tree |

---

## Step 2 — Verify a University Email

```js
import { EmailVerifier } from './src/identity/email-verifier.js';
import { readFileSync } from 'fs';

const verifier = new EmailVerifier();

// Load a .eml file exported from your email client
const emlContent = readFileSync('./my-university-email.eml', 'utf-8');

try {
  const dkimResult = await verifier.verify(emlContent);
  
  console.log('Domain:', dkimResult.domain);         // 'university.edu'
  console.log('Valid domain?', dkimResult.isValid);   // true/false
  console.log('Selector:', dkimResult.selector);      // DKIM selector
  console.log('Body hash:', dkimResult.bodyHash);
} catch (err) {
  console.error('Verification failed:', err.message);
}
```

### Allowed Domains

Configured in `src/config.js`:
```js
IDENTITY: {
  ALLOWED_DOMAINS: ['university.edu', 'student.university.edu'],
  ADMIN_DOMAINS: ['admin.university.edu'],
}
```

To add your university's domain, edit `ALLOWED_DOMAINS` before running.

### How to export a .eml file

1. **Gmail**: Open email → Three dots (⋮) → "Show original" → "Download Original"
2. **Outlook**: Open email → File → Save As → choose `.eml` format
3. **Thunderbird**: Right-click email → "Save As" → `.eml`

---

## Step 3 — Build a Membership Tree

```js
import { IdentityManager } from './src/identity/identity-manager.js';
import { MembershipTree } from './src/identity/membership-tree.js';

const mgr = new IdentityManager();

// Create identities for 3 students
const alice = mgr.create();
const bob = mgr.create();
const carol = mgr.create();

// Create the tree and add members
const tree = new MembershipTree();

tree.addMember(alice.commitment);
tree.addMember(bob.commitment);
tree.addMember(carol.commitment);

console.log('Members:', tree.memberCount);   // 3
console.log('Tree root:', tree.getRoot());   // bigint (Merkle root)
```

---

## Step 4 — Generate & Verify Merkle Proofs

```js
// Generate a Merkle proof for Alice (index 0)
const proof = tree.generateMerkleProof(0);

console.log('Proof root:', proof.root);       // matches tree root
console.log('Proof leaf:', proof.leaf);        // alice.commitment
console.log('Siblings:', proof.siblings);      // sibling hashes
console.log('Path indices:', proof.index);

// Verify the proof
const valid = tree.verifyMerkleProof(proof);
console.log('Proof valid?', valid);            // true
```

### Root History (delay tolerance)

The tree keeps the last N roots (default: 10). This handles network propagation delay — a proof generated against root #5 is still valid even if the current root is #7.

```js
tree.addMember(mgr.create().commitment);  // root changes

// Old proof is still valid if within ROOT_HISTORY_SIZE
const stillValid = tree.isRecentRoot(proof.root);
console.log('Root still accepted?', stillValid);  // true (if < 10 inserts ago)
```

---

## Step 5 — Remove and Update Members

```js
// Remove Bob (index 1)
tree.removeMember(1);
console.log('Members after removal:', tree.memberCount);  // 2

// Alice's proof index stays 0
// Carol's proof index is now recalculated
```

---

## Full Working Example

Save as `backend/demo-identity.js` and run with `node demo-identity.js`:

```js
import { IdentityManager } from './src/identity/identity-manager.js';
import { MembershipTree } from './src/identity/membership-tree.js';

const mgr = new IdentityManager();
const tree = new MembershipTree();

// Simulate 5 students joining
const students = [];
for (let i = 0; i < 5; i++) {
  const id = mgr.create();
  tree.addMember(id.commitment);
  students.push(id);
  console.log(`Student ${i + 1} joined. Commitment: ${id.commitment.toString().slice(0, 20)}…`);
}

console.log(`\nTree has ${tree.memberCount} members`);
console.log(`Current root: ${tree.getRoot().toString().slice(0, 20)}…`);

// Student 3 generates a proof
const proof = tree.generateMerkleProof(2);
console.log(`\nStudent 3's proof valid? ${tree.verifyMerkleProof(proof)}`);

// Serialize identity for storage (KEEP THIS SECRET!)
const exported = mgr.export(students[0]);
console.log(`\nExported identity: ${exported.slice(0, 40)}…`);

// Re-import later
const restored = mgr.import(exported);
console.log(`Restored commitment matches? ${restored.commitment === students[0].commitment}`);
```

---

## Running the Tests

```bash
cd backend
npm run test:identity
```

All 32 tests should pass, covering:
- Identity creation (random & deterministic)
- Identity serialization/deserialization
- Email DKIM parsing & domain validation
- Merkle tree operations (add, remove, proof, verify)
- Root history tracking
- Edge cases & error handling

---

**Next**: [Phase 2 — P2P Network & Storage →](./03-P2P-NETWORK-AND-STORAGE.md)
