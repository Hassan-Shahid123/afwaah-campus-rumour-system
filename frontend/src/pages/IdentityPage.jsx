import { useState } from 'react';
import { useUser } from '../useUser';
import { identityManager, emailVerifier, membershipTree } from '../api';

export default function IdentityPage() {
  const { user, loading, createAccount, restoreAccount, logout } = useUser();

  return (
    <div>
      <div className="page-header">
        <h2>My Account</h2>
        <p>Your anonymous identity on the Afwaah network</p>
      </div>

      {!user ? (
        <GettingStarted loading={loading} createAccount={createAccount} restoreAccount={restoreAccount} />
      ) : (
        <>
          <AccountCard user={user} logout={logout} />
          <EmailVerifyCard />
          <SignVerifyCard user={user} />
          <AdvancedSection />
        </>
      )}
    </div>
  );
}

/* ── Getting Started (no account yet) ─────────────────────── */
function GettingStarted({ loading, createAccount, restoreAccount }) {
  const [showRestore, setShowRestore] = useState(false);
  const [restoreKey, setRestoreKey] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setError('');
    try { await createAccount(); }
    catch (err) { setError(err.message); }
  };

  const handleRestore = async () => {
    setError('');
    try { await restoreAccount(restoreKey); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card welcome-card">
      <div style={{ fontSize: 48, marginBottom: 16 }}>&#9670;</div>
      <h3 style={{ marginBottom: 8 }}>Welcome to Afwaah</h3>
      <p style={{ color: '#555', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        Create an anonymous account to post rumors, vote on campus news,
        and build your reputation — all without revealing your identity.
      </p>

      <button className="btn btn-primary btn-lg" onClick={handleCreate} disabled={loading}
        style={{ width: '100%', justifyContent: 'center', padding: '14px 24px', fontSize: 14 }}>
        {loading ? <><span className="spinner" /> Creating...</> : 'Create Anonymous Account'}
      </button>

      <div style={{ margin: '20px 0', fontSize: 13, color: '#888' }}>or</div>

      {!showRestore ? (
        <button className="btn btn-secondary" onClick={() => setShowRestore(true)}
          style={{ width: '100%', justifyContent: 'center' }}>
          I Have a Recovery Key
        </button>
      ) : (
        <div style={{ textAlign: 'left' }}>
          <div className="form-group">
            <label>Recovery Key</label>
            <input type="text" className="input-mono" value={restoreKey}
              onChange={e => setRestoreKey(e.target.value)}
              placeholder="Paste your recovery key here..." />
            <div className="hint">This is the key you saved when you first created your account</div>
          </div>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={handleRestore} disabled={!restoreKey || loading}>
              Restore Account
            </button>
            <button className="btn btn-secondary" onClick={() => setShowRestore(false)}>Cancel</button>
          </div>
        </div>
      )}

      {error && <div className="result-box error" style={{ marginTop: 16, textAlign: 'left' }}>{error}</div>}
    </div>
  );
}

/* ── Account Card (logged in) ─────────────────────────────── */
function AccountCard({ user, logout }) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState('');

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="card">
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        <span style={{ fontSize: 20 }}>&#9670;</span>
        <span>Your Anonymous Account</span>
        <span className="badge active-badge">Active</span>
      </div>

      <div className="account-info-grid">
        <div className="account-field">
          <div className="account-label">Your Anonymous ID</div>
          <div className="account-value mono">{user.nullifier}</div>
          <button className="btn-copy" onClick={() => copyToClipboard(user.nullifier, 'id')}>
            {copied === 'id' ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        <div className="account-field">
          <div className="account-label">Account Created</div>
          <div className="account-value">{new Date(user.createdAt).toLocaleDateString()}</div>
        </div>

        <div className="account-field full-width">
          <div className="account-label">
            Recovery Key
            <span style={{ color: '#c00', marginLeft: 8, fontSize: 11, fontWeight: 400 }}>
              ⚠ Save this — only way to recover your account
            </span>
          </div>
          <div className="account-value mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
            {showKey ? user.exportedKey : '•'.repeat(40)}
          </div>
          <div className="btn-group" style={{ marginTop: 8 }}>
            <button className="btn-copy" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
            <button className="btn-copy" onClick={() => copyToClipboard(user.exportedKey, 'key')}>
              {copied === 'key' ? '✓ Copied' : 'Copy Key'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 16 }}>
        <button className="btn btn-danger" onClick={logout}>Sign Out</button>
      </div>
    </div>
  );
}

/* ── Email Verification (.eml) — main card ────────────────── */
function EmailVerifyCard() {
  const [emlContent, setEmlContent] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setLoading(true); setError(''); setResult(null);
    try { setResult(await emailVerifier.verifyEmail(emlContent)); }
    catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        &#9993; Verify Your University Email
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Prove you have a campus email using DKIM verification. This checks the cryptographic
        signature in the email headers — your address stays private.
      </p>

      <div style={{ background: '#f8f8f8', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
        <strong>How to get your .eml file:</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>Log into your <strong>university email</strong> inbox (e.g. @seecs.edu.pk)</li>
          <li>Open <strong>any email</strong> in your inbox (sent to you or by you)</li>
          <li>In Gmail: click ⋮ → "Download message" → saves as .eml</li>
          <li>In Outlook: File → Save As → choose .eml format</li>
          <li>Open the .eml file in Notepad → <strong>Select All (Ctrl+A)</strong> → <strong>Copy (Ctrl+C)</strong></li>
          <li>Paste the <strong>entire content</strong> below and click Verify</li>
        </ol>
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff3cd', borderRadius: 4, fontSize: 12 }}>
          <strong>⚠ Critical:</strong> You must paste the <strong>complete</strong> .eml file — do not remove or edit any part,
          including large blocks of random characters (those are attachments). The system uses <strong>DKIM cryptographic verification</strong>:
          it fetches the sender's RSA public key from DNS and verifies the digital signature. If even one character
          is changed, the verification will fail. This same technique is what Gmail shows as "signed by seecs.edu.pk".
        </div>
        <div style={{ marginTop: 6, padding: '8px 10px', background: '#e3f2fd', borderRadius: 4, fontSize: 12 }}>
          <strong>Why from your university inbox?</strong> The "Delivered-To" header proves which inbox the .eml was downloaded from.
          If someone downloads your email from their Gmail inbox and tries to use it, the system will detect it's from a Gmail inbox and reject it.
        </div>
      </div>

      <div className="form-group">
        <label>Paste .eml File Content</label>
        <textarea rows={6} value={emlContent} onChange={e => setEmlContent(e.target.value)}
          placeholder={'Paste the entire raw .eml content here...\n\nIt starts with headers like:\nFrom: yourname@seecs.edu.pk\nDKIM-Signature: v=1; a=rsa-sha256; d=seecs.edu.pk; ...'}
          style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </div>
      <button className="btn btn-primary" onClick={handleVerify} disabled={loading || !emlContent}>
        {loading ? <><span className="spinner" /> Verifying...</> : 'Verify Email'}
      </button>

      {result && (
        <div className="result-box success" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>✓ Email Cryptographically Verified!</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div><strong>Inbox Owner:</strong> {result.deliveredTo || result.domain}</div>
            <div><strong>From:</strong> {result.from}</div>
            <div><strong>DKIM Signature:</strong> <span style={{ color: '#080', fontWeight: 600 }}>{result.dkimStatus === 'pass' ? '✓ PASS' : result.dkimStatus || 'N/A'}</span> (d={result.signingDomain})</div>
            <div><strong>Message ID:</strong> {result.messageId}</div>
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#e8f5e9', borderRadius: 4, fontSize: 12 }}>
              <strong>3-Layer Verification Passed:</strong><br />
              1. ✓ <strong>DKIM Crypto:</strong> RSA signature verified against DNS public key — headers not tampered<br />
              2. ✓ <strong>DKIM Domain:</strong> Signing domain ({result.signingDomain}) is an authorized university<br />
              3. ✓ <strong>Inbox Ownership:</strong> .eml downloaded from a university inbox ({result.deliveredTo})
            </div>
          </div>
        </div>
      )}
      {error && <div className="result-box error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

/* ── Sign & Verify messages — main card ───────────────────── */
function SignVerifyCard({ user }) {
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [signResult, setSignResult] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const copyText = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleSign = async () => {
    setError(''); setSignResult(null);
    try {
      const data = await identityManager.signMessage(user.exportedKey, message);
      // signature comes as a JSON string from the backend
      const sig = typeof data.signature === 'object' ? JSON.stringify(data.signature) : String(data.signature);
      setSignResult(sig);
      setSignature(sig);
      // publicKey comes as ["bigint1","bigint2"] array from sign response
      const pk = data.publicKey
        ? JSON.stringify(data.publicKey)
        : (typeof user.publicKey === 'object' ? JSON.stringify(user.publicKey) : String(user.publicKey));
      setPubKey(pk);
    } catch (err) { setError(err.message); }
  };

  const handleVerify = async () => {
    setError(''); setVerifyResult(null);
    try {
      const data = await identityManager.verifySignature(message, signature, pubKey);
      setVerifyResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        &#9999; Sign & Verify Messages
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Cryptographically sign any message to prove <strong>you</strong> wrote it, without revealing your real identity.
        Others can verify your signature using your public key.
      </p>

      <div style={{ background: '#f8f8f8', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
        <strong>How it works:</strong>
        <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>Type any message below and click "Sign with My Key"</li>
          <li>Your private key creates a unique <strong>signature</strong> (a cryptographic proof)</li>
          <li>Share the message + signature + your public key with anyone</li>
          <li>They paste all three below and click "Verify" to confirm you wrote it</li>
        </ol>
      </div>

      {/* Step 1: Sign */}
      <h4 style={{ marginBottom: 8, fontSize: 14 }}>Step 1 — Sign a Message</h4>
      <div className="form-group">
        <label>Your Message</label>
        <input type="text" value={message} onChange={e => setMessage(e.target.value)}
          placeholder='e.g. "I confirm this rumor is true"' />
      </div>
      <button className="btn btn-primary" onClick={handleSign} disabled={!message}>Sign with My Key</button>

      {signResult && (
        <div className="result-box success" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>✓ Signed!</div>
          <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Signature</strong> (auto-filled below):</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', background: '#fff', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}>
            {signResult}
          </div>
          <button className="btn-copy" style={{ marginTop: 6 }} onClick={() => copyText(signResult, 'sig')}>
            {copied === 'sig' ? '✓ Copied' : 'Copy Signature'}
          </button>
        </div>
      )}

      {/* Step 2: Verify */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 20 }}>
        <h4 style={{ marginBottom: 8, fontSize: 14 }}>Step 2 — Verify a Signature</h4>
        <p className="hint" style={{ marginBottom: 12 }}>
          These fields auto-fill after signing. To verify someone else's message, paste their signature and public key here.
        </p>
        <div className="form-group">
          <label>Signature</label>
          <input type="text" className="input-mono" value={signature} onChange={e => setSignature(e.target.value)}
            placeholder="Paste a signature here..." style={{ fontSize: 11 }} />
        </div>
        <div className="form-group">
          <label>Public Key</label>
          <input type="text" className="input-mono" value={pubKey} onChange={e => setPubKey(e.target.value)}
            placeholder="Paste the signer's public key here..." style={{ fontSize: 11 }} />
        </div>
        <button className="btn btn-secondary" onClick={handleVerify} disabled={!message || !signature || !pubKey}>
          Verify Signature
        </button>
        {verifyResult !== null && (
          <div className={`result-box ${verifyResult.valid ? 'success' : 'error'}`} style={{ marginTop: 12 }}>
            {verifyResult.valid ? '✓ Valid — this person wrote the message' : '✗ Invalid — the signature does not match'}
          </div>
        )}
      </div>
      {error && <div className="result-box error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

/* ── Advanced Tools (collapsed by default) ────────────────── */
function AdvancedSection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card collapsible-card">
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Advanced Identity Tools
        </div>
        <span className="collapse-icon">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 20 }}>
          <MembershipTools />
        </div>
      )}
    </div>
  );
}

/* ── Membership Tree ──────────────────────────────────────── */
function MembershipTools() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  const handleInfo = async () => {
    setError('');
    try { setInfo(await membershipTree.getInfo()); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Membership Tree</h4>
      <p className="hint" style={{ marginBottom: 16 }}>
        The Semaphore group tree — includes all registered anonymous members.
      </p>
      <button className="btn btn-secondary" onClick={handleInfo}>View Tree Info</button>
      {info && (
        <div className="stats-row" style={{ marginTop: 12 }}>
          <div className="stat-card">
            <div className="stat-value">{info.size}</div>
            <div className="stat-label">Members</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{info.depth}</div>
            <div className="stat-label">Tree Depth</div>
          </div>
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}
