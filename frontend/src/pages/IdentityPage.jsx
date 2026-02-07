import { useState } from 'react';
import { useUser } from '../useUser';
import { membershipTree } from '../api';

export default function IdentityPage() {
  const { user, loading, verifyAndCreateAccount, restoreAccount, logout } = useUser();

  return (
    <div>
      <div className="page-header">
        <h2>My Account</h2>
        <p>Your anonymous identity on the Afwaah network</p>
      </div>

      {!user ? (
        <GettingStarted loading={loading} verifyAndCreateAccount={verifyAndCreateAccount} restoreAccount={restoreAccount} />
      ) : (
        <>
          <AccountCard user={user} logout={logout} />
          <AdvancedSection />
        </>
      )}
    </div>
  );
}

/* ── Getting Started — email verification IS account creation ── */
function GettingStarted({ loading, verifyAndCreateAccount, restoreAccount }) {
  const [showRestore, setShowRestore] = useState(false);
  const [restoreKey, setRestoreKey] = useState('');
  const [emlContent, setEmlContent] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleVerifyAndCreate = async () => {
    setError(''); setResult(null);
    try {
      const userData = await verifyAndCreateAccount(emlContent);
      setResult(userData);
    } catch (err) { setError(err.message); }
  };

  const handleRestore = async () => {
    setError('');
    try { await restoreAccount(restoreKey); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      {/* Welcome header */}
      <div className="card welcome-card">
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#9670;</div>
        <h3 style={{ marginBottom: 8 }}>Welcome to Afwaah</h3>
        <p style={{ color: '#555', marginBottom: 8, fontSize: 14, lineHeight: 1.6 }}>
          Join the anonymous campus rumor network. To create your account, verify your
          <strong> university email</strong> — this proves you're a student without revealing your identity.
        </p>
        <p style={{ color: '#888', fontSize: 12 }}>
          One university email = one anonymous account. No passwords, no personal data stored.
        </p>
      </div>

      {/* Email Verification = Account Creation */}
      <div className="card">
        <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
          &#9993; Create Account via University Email
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>
          Upload a <strong>.eml file</strong> from your university inbox.
          The system cryptographically verifies the DKIM signature to confirm you have access to a university email — then
          creates your anonymous account automatically.
        </p>

        <div style={{ background: '#f8f8f8', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.7 }}>
          <strong>How to get your .eml file:</strong>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>Log into your <strong>university email</strong> inbox (e.g. @seecs.edu.pk)</li>
            <li>Open <strong>any email</strong> in your inbox</li>
            <li>In Gmail: click &#8942; → "Download message" → saves as .eml</li>
            <li>In Outlook: File → Save As → choose .eml format</li>
            <li><strong>Upload</strong> the .eml file below or paste its contents</li>
          </ol>
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#fff3cd', borderRadius: 4, fontSize: 12 }}>
            <strong>Important:</strong> Do not edit the .eml file. The DKIM cryptographic signature covers the email headers —
            if even one character is changed, verification fails. This is the same technique Gmail uses to show "signed by seecs.edu.pk".
          </div>
        </div>

        <div className="form-group">
          <label>Upload .eml File</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <label
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', background: 'var(--accent)', color: '#fff',
                borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
              }}
            >
              Choose .eml File
              <input
                type="file"
                accept=".eml"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => setEmlContent(ev.target.result);
                  reader.onerror = () => setError('Failed to read file');
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>
            <span style={{ fontSize: 12, color: '#888' }}>
              {emlContent ? '✓ File loaded — ready to verify' : 'or paste content below'}
            </span>
          </div>

          <label>Or Paste .eml Content Manually</label>
          <textarea rows={5} value={emlContent} onChange={e => setEmlContent(e.target.value)}
            placeholder={'Paste the entire raw .eml content here...\n\nIt starts with headers like:\nDelivered-To: yourname@seecs.edu.pk\nDKIM-Signature: v=1; a=rsa-sha256; ...'}
            style={{ fontFamily: 'monospace', fontSize: 12 }} />
        </div>

        <button className="btn btn-primary btn-lg" onClick={handleVerifyAndCreate}
          disabled={loading || !emlContent}
          style={{ width: '100%', justifyContent: 'center', padding: '14px 24px', fontSize: 14 }}>
          {loading ? <><span className="spinner" /> Verifying & Creating Account...</> : 'Verify Email & Create Account'}
        </button>

        {result && (
          <div className="result-box success" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>&#10003; Account Created!</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Your anonymous identity has been created and cryptographically bound to your university email.
              You can now post rumors, vote, and build your reputation.
            </div>
          </div>
        )}

        {error && <div className="result-box error" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {/* Restore existing account */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
          Already have an account?
        </div>
        {!showRestore ? (
          <button className="btn btn-secondary" onClick={() => setShowRestore(true)}
            style={{ width: '100%', justifyContent: 'center' }}>
            Restore with Recovery Key
          </button>
        ) : (
          <div>
            <div className="form-group">
              <label>Recovery Key</label>
              <input type="text" className="input-mono" value={restoreKey}
                onChange={e => setRestoreKey(e.target.value)}
                placeholder="Paste your recovery key here..." />
              <div className="hint">This is the key you saved when you first created your account</div>
            </div>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleRestore} disabled={!restoreKey || loading}>
                {loading ? <><span className="spinner" /> Restoring...</> : 'Restore Account'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowRestore(false)}>Cancel</button>
            </div>
          </div>
        )}
        {!showRestore && error && <div className="result-box error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}

/* ── Account Card (logged in — always verified) ───────────── */
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
        <span className="badge active-badge">Verified</span>
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

        {user.verifiedEmail && (
          <div className="account-field">
            <div className="account-label">Verified Email</div>
            <div className="account-value" style={{ fontSize: 13 }}>
              &#10003; {user.verifiedEmail}
            </div>
          </div>
        )}

        <div className="account-field full-width">
          <div className="account-label">
            Recovery Key
            <span style={{ color: '#c00', marginLeft: 8, fontSize: 11, fontWeight: 400 }}>
              &#9888; Save this — only way to recover your account
            </span>
          </div>
          <div className="account-value mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
            {showKey ? user.exportedKey : '\u2022'.repeat(40)}
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

/* ── Advanced Tools (collapsed by default) ────────────────── */
function AdvancedSection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card collapsible-card">
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Advanced Identity Tools
        </div>
        <span className="collapse-icon">{expanded ? '&#9650;' : '&#9660;'}</span>
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
