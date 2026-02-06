import { useState } from 'react';
import { snapshotter, tombstoneManager } from '../api';

export default function RumorsPage() {
  return (
    <div>
      <div className="page-header">
        <h2>Rumors & Voting</h2>
        <p>Submit rumors, cast votes with predictions, and manage tombstones — all via the Snapshotter OpLog</p>
      </div>

      <SubmitRumorSection />
      <CastVoteSection />
      <JoinOperationSection />
      <ViewActiveRumorsSection />
      <div className="divider" />
      <TombstoneCreateSection />
      <AdminTombstoneSection />
      <TombstoneCheckSection />
      <TombstoneListSection />
      <ValidateVoteSection />
    </div>
  );
}

/* ── Submit Rumor (via Snapshotter.ingest) ──────────────────── */
function SubmitRumorSection() {
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('general');
  const [nullifier, setNullifier] = useState('');
  const [rumorId, setRumorId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const topics = ['administration', 'safety', 'events', 'academic', 'facilities', 'general'];

  const handleSubmit = async () => {
    setError('');
    try {
      const id = rumorId || `rumor_${Date.now()}`;
      const op = {
        type: 'RUMOR',
        payload: {
          id,
          text,
          topic,
          nullifier: nullifier || `nul_${Date.now()}`,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };
      const data = await snapshotter.ingest(op);
      setResult({ ...data, rumorId: id });
      // Also register with tombstone manager
      await tombstoneManager.registerRumor(id, op.payload.nullifier);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        Submit Rumor
        <span className="badge">snapshotter.ingest(RUMOR)</span>
      </div>
      <div className="form-group">
        <label>Rumor Text</label>
        <textarea rows={3} value={text} onChange={e => setText(e.target.value)}
          placeholder="Enter the rumor text (max 2000 chars)..." maxLength={2000} />
        <div className="hint">{text.length}/2000 characters</div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Topic</label>
          <select value={topic} onChange={e => setTopic(e.target.value)}>
            {topics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Nullifier (author ID)</label>
          <input type="text" className="input-mono" value={nullifier} onChange={e => setNullifier(e.target.value)}
            placeholder="Auto-generated if blank" />
        </div>
      </div>
      <div className="form-group">
        <label>Rumor ID (optional)</label>
        <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)}
          placeholder="Auto-generated if blank" />
      </div>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={!text}>Submit Rumor</button>
      {result && (
        <div className="result-box success">
          {`Rumor submitted!\nrumorId: ${result.rumorId}\nsnapshotTriggered: ${result.snapshotTriggered}\nopsSinceSnapshot: ${result.opsSinceSnapshot}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Cast Vote (via Snapshotter.ingest) ────────────────────── */
function CastVoteSection() {
  const [rumorId, setRumorId] = useState('');
  const [vote, setVote] = useState('TRUE');
  const [nullifier, setNullifier] = useState('');
  const [predTrue, setPredTrue] = useState('0.5');
  const [predFalse, setPredFalse] = useState('0.3');
  const [predUnverified, setPredUnverified] = useState('0.2');
  const [stakeAmount, setStakeAmount] = useState('1');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleVote = async () => {
    setError('');
    try {
      const op = {
        type: 'VOTE',
        payload: {
          rumorId,
          vote,
          nullifier: nullifier || `voter_${Date.now()}`,
          prediction: {
            TRUE: parseFloat(predTrue),
            FALSE: parseFloat(predFalse),
            UNVERIFIED: parseFloat(predUnverified),
          },
          stakeAmount: parseFloat(stakeAmount),
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };
      const data = await snapshotter.ingest(op);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        Cast Vote
        <span className="badge">snapshotter.ingest(VOTE)</span>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)}
            placeholder="ID of the rumor to vote on" />
        </div>
        <div className="form-group">
          <label>Vote</label>
          <select value={vote} onChange={e => setVote(e.target.value)}>
            <option value="TRUE">TRUE</option>
            <option value="FALSE">FALSE</option>
            <option value="UNVERIFIED">UNVERIFIED</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Voter Nullifier</label>
          <input type="text" className="input-mono" value={nullifier} onChange={e => setNullifier(e.target.value)}
            placeholder="Auto-generated if blank" />
        </div>
        <div className="form-group">
          <label>Stake Amount</label>
          <input type="number" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} min="1" />
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
          Prediction (must sum to 1.0)
        </label>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label style={{ fontSize: 11 }}>P(TRUE)</label>
            <input type="number" step="0.01" min="0" max="1" value={predTrue} onChange={e => setPredTrue(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label style={{ fontSize: 11 }}>P(FALSE)</label>
            <input type="number" step="0.01" min="0" max="1" value={predFalse} onChange={e => setPredFalse(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label style={{ fontSize: 11 }}>P(UNVERIFIED)</label>
            <input type="number" step="0.01" min="0" max="1" value={predUnverified} onChange={e => setPredUnverified(e.target.value)} />
          </div>
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleVote} disabled={!rumorId}>Cast Vote</button>
      {result && (
        <div className="result-box success">
          {`Vote recorded!\nsnapshotTriggered: ${result.snapshotTriggered}\nopsSinceSnapshot: ${result.opsSinceSnapshot}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Join Operation ────────────────────────────────────────── */
function JoinOperationSection() {
  const [commitment, setCommitment] = useState('');
  const [nullifier, setNullifier] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    setError('');
    try {
      const op = {
        type: 'JOIN',
        payload: {
          commitment: commitment || `commit_${Date.now()}`,
          nullifier: nullifier || commitment || `nul_${Date.now()}`,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };
      const data = await snapshotter.ingest(op);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        Join Network
        <span className="badge">snapshotter.ingest(JOIN)</span>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Commitment</label>
          <input type="text" className="input-mono" value={commitment} onChange={e => setCommitment(e.target.value)}
            placeholder="Identity commitment" />
        </div>
        <div className="form-group">
          <label>Nullifier</label>
          <input type="text" className="input-mono" value={nullifier} onChange={e => setNullifier(e.target.value)}
            placeholder="Derived from identity" />
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleJoin}>Send JOIN</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── View Active Rumors (from Snapshotter rebuild) ─────────── */
function ViewActiveRumorsSection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRebuild = async () => {
    setLoading(true); setError('');
    try {
      const result = await snapshotter.rebuild();
      setData(result);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title">
        Active Rumors
        <span className="badge">snapshotter.rebuild()</span>
      </div>
      <button className="btn btn-primary" onClick={handleRebuild} disabled={loading}>
        {loading && <span className="spinner" />} Rebuild State & View
      </button>
      {data && (
        <>
          <div className="stats-row" style={{ marginTop: 16 }}>
            <div className="stat-card">
              <div className="stat-value">{data.activeRumors}</div>
              <div className="stat-label">Active Rumors</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.tombstonedRumors}</div>
              <div className="stat-label">Tombstoned</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.totalVotes}</div>
              <div className="stat-label">Total Votes</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.registeredUsers}</div>
              <div className="stat-label">Users</div>
            </div>
          </div>
          {data.state && Object.keys(data.state.rumors).length > 0 && (
            <table className="data-table">
              <thead>
                <tr><th>ID</th><th>Text</th><th>Topic</th><th>Votes</th></tr>
              </thead>
              <tbody>
                {Object.entries(data.state.rumors).map(([id, r]) => (
                  <tr key={id}>
                    <td className="mono">{id}</td>
                    <td>{r.text?.substring(0, 80)}{r.text?.length > 80 ? '...' : ''}</td>
                    <td><span className="tag">{r.topic}</span></td>
                    <td>{data.state.votes[id]?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── tombstoneManager.createTombstone() ────────────────────── */
function TombstoneCreateSection() {
  const [rumorId, setRumorId] = useState('');
  const [authorNullifier, setAuthorNullifier] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setError('');
    try {
      const data = await tombstoneManager.createTombstone(rumorId, authorNullifier, reason || undefined);
      setResult(data);
      // Also ingest into snapshotter
      await snapshotter.ingest({
        type: 'TOMBSTONE',
        payload: { rumorId, authorNullifier, reason },
        timestamp: Date.now(),
      });
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        tombstoneManager.createTombstone()
        <span className="badge">Author Only</span>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Author Nullifier</label>
          <input type="text" className="input-mono" value={authorNullifier} onChange={e => setAuthorNullifier(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label>Reason (optional)</label>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="author_requested" />
      </div>
      <button className="btn btn-danger" onClick={handleCreate} disabled={!rumorId || !authorNullifier}>
        Delete Rumor (Tombstone)
      </button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── tombstoneManager.createAdminTombstone() ───────────────── */
function AdminTombstoneSection() {
  const [rumorId, setRumorId] = useState('');
  const [reason, setReason] = useState('');
  const [adminId, setAdminId] = useState('system');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setError('');
    try {
      const data = await tombstoneManager.createAdminTombstone(rumorId, reason, adminId);
      setResult(data);
      await snapshotter.ingest({
        type: 'TOMBSTONE',
        payload: { rumorId, authorNullifier: adminId, reason },
        timestamp: Date.now(),
      });
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        tombstoneManager.createAdminTombstone()
        <span className="badge">Admin</span>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Admin ID</label>
          <input type="text" value={adminId} onChange={e => setAdminId(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label>Reason</label>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="spam / policy_violation" />
      </div>
      <button className="btn btn-danger" onClick={handleCreate} disabled={!rumorId}>Admin Tombstone</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── tombstoneManager.isTombstoned ─────────────────────────── */
function TombstoneCheckSection() {
  const [rumorId, setRumorId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCheck = async () => {
    setError('');
    try {
      const data = await tombstoneManager.isTombstoned(rumorId);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">tombstoneManager.isTombstoned()</div>
      <div className="inline-row">
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleCheck} disabled={!rumorId}>Check</button>
      </div>
      {result && (
        <div className={`result-box ${result.isTombstoned ? 'error' : 'success'}`}>
          {result.isTombstoned
            ? `✗ TOMBSTONED\n${JSON.stringify(result.metadata, null, 2)}`
            : '✓ Active (not tombstoned)'}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── tombstoneManager.getAll() ─────────────────────────────── */
function TombstoneListSection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    setError('');
    try { setData(await tombstoneManager.getAll()); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">tombstoneManager.getTombstonedIds()</div>
      <button className="btn btn-secondary" onClick={handleFetch}>Fetch All Tombstones</button>
      {data && (
        <div className="result-box success">
          {`Count: ${data.count}\nIDs: ${data.tombstonedIds.length > 0 ? data.tombstonedIds.join(', ') : '(none)'}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── tombstoneManager.validateVote() ───────────────────────── */
function ValidateVoteSection() {
  const [rumorId, setRumorId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleValidate = async () => {
    setError('');
    try {
      const data = await tombstoneManager.validateVote(rumorId);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">tombstoneManager.validateVote()</div>
      <div className="inline-row">
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleValidate} disabled={!rumorId}>Validate</button>
      </div>
      {result && (
        <div className={`result-box ${result.valid ? 'success' : 'error'}`}>
          {result.valid ? '✓ Vote is allowed on this rumor' : `✗ ${result.reason}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}
