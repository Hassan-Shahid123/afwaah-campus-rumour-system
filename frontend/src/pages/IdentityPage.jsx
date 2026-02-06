import { useState, useEffect } from 'react';
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
          <EmailVerifyBox />
          <AdvancedSection user={user} />
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

/* ── Email Verification (simple & prominent) ──────────────── */
function EmailVerifyBox() {
  const STORAGE_KEY = 'afwaah_verified_email';
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [domains, setDomains] = useState([]);

  useEffect(() => {
    emailVerifier.getAllowedDomains()
      .then(data => setDomains(data.allowedDomains || []))
      .catch(() => {});
  }, []);

  const handleCheck = async () => {
    if (!email.includes('@')) { setError('Please enter a valid email'); return; }
    setLoading(true); setError('');
    try {
      const data = await emailVerifier.checkDomain(email);
      setResult(data);
      if (data.verified) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // Already verified
  if (result?.verified) {
    return (
      <div className="card" style={{ borderLeft: '4px solid #2a9d2a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>✓</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>University Verified</div>
            <div style={{ color: '#555', fontSize: 13 }}>
              {result.email} — <strong>{result.domain}</strong> is a recognized campus domain
            </div>
          </div>
          <span className="badge active-badge" style={{ marginLeft: 'auto' }}>Verified</span>
        </div>
        <button className="btn btn-secondary" style={{ marginTop: 12, fontSize: 12 }}
          onClick={() => { setResult(null); localStorage.removeItem(STORAGE_KEY); }}>
          Re-verify with different email
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ borderLeft: '4px solid #333' }}>
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 15 }}>
        📧 Verify Your University Email
      </div>
      <p style={{ color: '#555', fontSize: 13, margin: '4px 0 16px', lineHeight: 1.5 }}>
        Enter your university email to get posting permission. We only check the domain — your email stays private.
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your.name@university.edu"
          onKeyDown={e => e.key === 'Enter' && handleCheck()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={handleCheck} disabled={loading || !email}>
          {loading ? 'Checking...' : 'Verify'}
        </button>
      </div>

      {result && !result.verified && (
        <div className="result-box error" style={{ marginTop: 12 }}>
          ✗ <strong>{result.domain}</strong> is not a recognized university domain.
          <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>
            Contact your admin if you think this is a mistake.
          </div>
        </div>
      )}

      {error && <div className="result-box error" style={{ marginTop: 12 }}>{error}</div>}

      {domains.length > 0 && (
        <details style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
          <summary style={{ cursor: 'pointer' }}>Accepted university domains</summary>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {domains.map(d => (
              <span key={d} style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>
                {d}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* ── Advanced Tools (collapsed by default) ────────────────── */
function AdvancedSection({ user }) {
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
          <SignVerifyTool user={user} />
          <div className="divider" />
          <RawEmailVerifyTool />
          <div className="divider" />
          <MembershipTools />
        </div>
      )}
    </div>
  );
}

/* ── Sign & Verify messages ───────────────────────────────── */
function SignVerifyTool({ user }) {
  const [message, setMessage] = useState('');
  const [signature, setSignature] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [signResult, setSignResult] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState('');

  const handleSign = async () => {
    setError('');
    try {
      const data = await identityManager.signMessage(user.exportedKey, message);
      setSignResult(data);
      const sig = typeof data.signature === 'object' ? JSON.stringify(data.signature) : data.signature;
      setSignature(sig);
      setPubKey(user.publicKey);
    } catch (err) { setError(err.message); }
  };

  const handleVerify = async () => {
    setError('');
    try {
      const data = await identityManager.verifySignature(message, signature, pubKey);
      setVerifyResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Sign & Verify Messages</h4>
      <p className="hint" style={{ marginBottom: 16 }}>
        Cryptographically sign a message to prove you wrote it, or verify someone else's signature.
      </p>
      <div className="form-group">
        <label>Message</label>
        <input type="text" value={message} onChange={e => setMessage(e.target.value)} placeholder="Type any message..." />
      </div>
      <button className="btn btn-primary" onClick={handleSign} disabled={!message}>Sign with My Key</button>
      {signResult && <div className="result-box success">Signature: {typeof signResult.signature === 'object' ? JSON.stringify(signResult.signature) : signResult.signature}</div>}

      <div style={{ marginTop: 20 }}>
        <div className="grid-2">
          <div className="form-group">
            <label>Signature to Verify</label>
            <input type="text" className="input-mono" value={signature} onChange={e => setSignature(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Public Key</label>
            <input type="text" className="input-mono" value={pubKey} onChange={e => setPubKey(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-secondary" onClick={handleVerify} disabled={!message || !signature || !pubKey}>
          Verify Signature
        </button>
        {verifyResult !== null && (
          <div className={`result-box ${verifyResult.valid ? 'success' : 'error'}`}>
            {verifyResult.valid ? '✓ Valid — this person wrote the message' : '✗ Invalid signature'}
          </div>
        )}
      </div>
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Raw Email Verification (advanced — .eml file) ────────── */
function RawEmailVerifyTool() {
  const [emlContent, setEmlContent] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setLoading(true); setError('');
    try { setResult(await emailVerifier.verifyEmail(emlContent)); }
    catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Raw .eml Email Verification</h4>
      <p className="hint" style={{ marginBottom: 16 }}>
        Advanced: Paste raw .eml content for full DKIM signature verification (ZK-Email).
      </p>
      <div className="form-group">
        <label>Raw Email Content (.eml)</label>
        <textarea rows={4} value={emlContent} onChange={e => setEmlContent(e.target.value)}
          placeholder="Paste the raw .eml content..." />
      </div>
      <button className="btn btn-primary" onClick={handleVerify} disabled={loading || !emlContent}>
        {loading ? <><span className="spinner" /> Verifying...</> : 'Verify Email'}
      </button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
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
