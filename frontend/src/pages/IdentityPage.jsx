import { useState } from 'react';
import { identityManager, emailVerifier, membershipTree } from '../api';

export default function IdentityPage() {
  return (
    <div>
      <div className="page-header">
        <h2>Identity & Membership</h2>
        <p>ZK identity creation, email verification, and Semaphore membership tree management</p>
      </div>

      <IdentityCreateSection />
      <IdentityImportSection />
      <SignVerifySection />
      <EmailVerifySection />
      <div className="divider" />
      <MembershipInfoSection />
      <MembershipAddSection />
      <MembershipRemoveSection />
      <MerkleProofSection />
      <MemberLookupSection />
    </div>
  );
}

/* ── IdentityManager.create() ──────────────────────────────── */
function IdentityCreateSection() {
  const [privateKey, setPrivateKey] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true); setError('');
    try {
      const data = await identityManager.create(privateKey || undefined);
      setResult(data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title">
        identityManager.create()
        <span className="badge">Semaphore V4</span>
      </div>
      <div className="form-group">
        <label>Private Key (optional)</label>
        <input type="text" className="input-mono" placeholder="Leave empty for random generation" value={privateKey} onChange={e => setPrivateKey(e.target.value)} />
        <div className="hint">If blank, a new random identity is generated</div>
      </div>
      <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
        {loading && <span className="spinner" />} Create Identity
      </button>
      {result && (
        <div className="result-box success">
          {`commitment: ${result.commitment}\nexportedKey: ${result.exportedKey}\npublicKey:   ${result.publicKey}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── IdentityManager.importIdentity() ──────────────────────── */
function IdentityImportSection() {
  const [exportedKey, setExportedKey] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    setLoading(true); setError('');
    try {
      const data = await identityManager.importIdentity(exportedKey);
      setResult(data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title">
        identityManager.importIdentity()
        <span className="badge">Restore</span>
      </div>
      <div className="form-group">
        <label>Exported Key</label>
        <input type="text" className="input-mono" placeholder="Paste the exportedKey from create()" value={exportedKey} onChange={e => setExportedKey(e.target.value)} />
      </div>
      <button className="btn btn-primary" onClick={handleImport} disabled={loading || !exportedKey}>
        {loading && <span className="spinner" />} Import Identity
      </button>
      {result && (
        <div className="result-box success">
          {`commitment: ${result.commitment}\npublicKey:   ${result.publicKey}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── signMessage + verifySignature ─────────────────────────── */
function SignVerifySection() {
  const [exportedKey, setExportedKey] = useState('');
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [signResult, setSignResult] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState('');

  const handleSign = async () => {
    setError('');
    try {
      const data = await identityManager.signMessage(exportedKey, message);
      setSignResult(data);
      setSignature(data.signature);
    } catch (err) { setError(err.message); }
  };

  const handleVerify = async () => {
    setError('');
    try {
      const data = await identityManager.verifySignature(message, signature, publicKey);
      setVerifyResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        identityManager.signMessage() & verifySignature()
        <span className="badge">Crypto</span>
      </div>
      <div className="grid-2">
        <div>
          <div className="form-group">
            <label>Exported Key (for signing)</label>
            <input type="text" className="input-mono" value={exportedKey} onChange={e => setExportedKey(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Message</label>
            <input type="text" value={message} onChange={e => setMessage(e.target.value)} placeholder="Hello world" />
          </div>
          <button className="btn btn-primary" onClick={handleSign} disabled={!exportedKey || !message}>Sign Message</button>
          {signResult && <div className="result-box success">{`signature: ${signResult.signature}`}</div>}
        </div>
        <div>
          <div className="form-group">
            <label>Public Key (for verification)</label>
            <input type="text" className="input-mono" value={publicKey} onChange={e => setPublicKey(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Signature</label>
            <input type="text" className="input-mono" value={signature} onChange={e => setSignature(e.target.value)} />
          </div>
          <button className="btn btn-secondary" onClick={handleVerify} disabled={!message || !signature || !publicKey}>Verify Signature</button>
          {verifyResult !== null && (
            <div className={`result-box ${verifyResult.valid ? 'success' : 'error'}`}>
              {verifyResult.valid ? '✓ Signature is VALID' : '✗ Signature is INVALID'}
            </div>
          )}
        </div>
      </div>
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── EmailVerifier.verifyEmail() ───────────────────────────── */
function EmailVerifySection() {
  const [emlContent, setEmlContent] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setLoading(true); setError('');
    try {
      const data = await emailVerifier.verifyEmail(emlContent);
      setResult(data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title">
        emailVerifier.verifyEmail()
        <span className="badge">ZK-Email SDK</span>
      </div>
      <div className="form-group">
        <label>EML Content</label>
        <textarea rows={6} placeholder="Paste raw .eml file content here..." value={emlContent} onChange={e => setEmlContent(e.target.value)} />
        <div className="hint">Paste the full email source (.eml) to extract and validate DKIM signatures</div>
      </div>
      <button className="btn btn-primary" onClick={handleVerify} disabled={loading || !emlContent}>
        {loading && <span className="spinner" />} Verify Email
      </button>
      {result && (
        <div className="result-box success">
          {JSON.stringify(result, null, 2)}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── MembershipTree info ───────────────────────────────────── */
function MembershipInfoSection() {
  const [info, setInfo] = useState(null);
  const [rootHistory, setRootHistory] = useState(null);
  const [error, setError] = useState('');

  const fetchInfo = async () => {
    setError('');
    try {
      const data = await membershipTree.getInfo();
      setInfo(data);
    } catch (err) { setError(err.message); }
  };

  const fetchHistory = async () => {
    setError('');
    try {
      const data = await membershipTree.getRootHistory(5);
      setRootHistory(data.rootHistory);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        membershipTree — Info
        <span className="badge">Semaphore Group</span>
      </div>
      <div className="btn-group">
        <button className="btn btn-primary" onClick={fetchInfo}>Get Tree Info</button>
        <button className="btn btn-secondary" onClick={fetchHistory}>Get Root History</button>
      </div>
      {info && (
        <div className="result-box success">
          {`size:    ${info.size}\ndepth:   ${info.depth}\nroot:    ${info.root}\nmembers: [${info.members.length} entries]`}
        </div>
      )}
      {rootHistory && (
        <div className="result-box success">
          {`Root History:\n${rootHistory.map((r, i) => `  [${i}] ${r}`).join('\n')}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── membershipTree.addMember / addMembers ─────────────────── */
function MembershipAddSection() {
  const [commitment, setCommitment] = useState('');
  const [commitments, setCommitments] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    setError('');
    try {
      const data = await membershipTree.addMember(commitment);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  const handleAddBatch = async () => {
    setError('');
    try {
      const arr = commitments.split('\n').map(c => c.trim()).filter(Boolean);
      const data = await membershipTree.addMembers(arr);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">membershipTree.addMember() / addMembers()</div>
      <div className="grid-2">
        <div>
          <div className="form-group">
            <label>Single Commitment</label>
            <input type="text" className="input-mono" value={commitment} onChange={e => setCommitment(e.target.value)} placeholder="Commitment BigInt" />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={!commitment}>Add Member</button>
        </div>
        <div>
          <div className="form-group">
            <label>Batch Commitments (one per line)</label>
            <textarea value={commitments} onChange={e => setCommitments(e.target.value)} placeholder="commitment1&#10;commitment2&#10;commitment3" />
          </div>
          <button className="btn btn-secondary" onClick={handleAddBatch} disabled={!commitments}>Add Batch</button>
        </div>
      </div>
      {result && <div className="result-box success">{`Tree size: ${result.size}\nRoot: ${result.root}`}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── membershipTree.removeMember() ─────────────────────────── */
function MembershipRemoveSection() {
  const [index, setIndex] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleRemove = async () => {
    setError('');
    try {
      const data = await membershipTree.removeMember(parseInt(index));
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">membershipTree.removeMember()</div>
      <div className="inline-row">
        <div className="form-group">
          <label>Member Index</label>
          <input type="number" value={index} onChange={e => setIndex(e.target.value)} placeholder="0" />
        </div>
        <button className="btn btn-danger" onClick={handleRemove} disabled={index === ''}>Remove</button>
      </div>
      {result && <div className="result-box success">{`Tree size: ${result.size}\nRoot: ${result.root}`}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── membershipTree.generateMerkleProof / verifyMerkleProof ── */
function MerkleProofSection() {
  const [leafIndex, setLeafIndex] = useState('');
  const [proofJson, setProofJson] = useState('');
  const [proof, setProof] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setError('');
    try {
      const data = await membershipTree.generateMerkleProof(parseInt(leafIndex));
      setProof(data);
      setProofJson(JSON.stringify(data, null, 2));
    } catch (err) { setError(err.message); }
  };

  const handleVerify = async () => {
    setError('');
    try {
      const p = JSON.parse(proofJson);
      const data = await membershipTree.verifyMerkleProof(p);
      setVerifyResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">membershipTree — Merkle Proof</div>
      <div className="grid-2">
        <div>
          <div className="form-group">
            <label>Leaf Index</label>
            <input type="number" value={leafIndex} onChange={e => setLeafIndex(e.target.value)} placeholder="0" />
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={leafIndex === ''}>Generate Proof</button>
          {proof && <div className="result-box success">{JSON.stringify(proof, null, 2)}</div>}
        </div>
        <div>
          <div className="form-group">
            <label>Proof JSON</label>
            <textarea rows={6} value={proofJson} onChange={e => setProofJson(e.target.value)} placeholder='Paste or edit proof JSON' />
          </div>
          <button className="btn btn-secondary" onClick={handleVerify} disabled={!proofJson}>Verify Proof</button>
          {verifyResult && (
            <div className={`result-box ${verifyResult.valid ? 'success' : 'error'}`}>
              {verifyResult.valid ? '✓ Merkle proof is VALID' : '✗ Merkle proof is INVALID'}
            </div>
          )}
        </div>
      </div>
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── membershipTree.indexOf() ──────────────────────────────── */
function MemberLookupSection() {
  const [commitment, setCommitment] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleLookup = async () => {
    setError('');
    try {
      const data = await membershipTree.indexOf(commitment);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">membershipTree.indexOf()</div>
      <div className="inline-row">
        <div className="form-group">
          <label>Commitment</label>
          <input type="text" className="input-mono" value={commitment} onChange={e => setCommitment(e.target.value)} placeholder="BigInt commitment" />
        </div>
        <button className="btn btn-primary" onClick={handleLookup} disabled={!commitment}>Lookup</button>
      </div>
      {result !== null && <div className="result-box success">{`index: ${result.index}`}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}
