import { useState } from 'react';
import { snapshotter, config } from '../api';

export default function StatePage() {
  return (
    <div>
      <div className="page-header">
        <h2>Node Dashboard</h2>
        <p>View your local node state, activity log, and system health</p>
      </div>

      <SystemOverview />
      <OpLogViewer />
      <ConfigViewer />
    </div>
  );
}

/* ── System Overview ──────────────────────────────────────── */
function SystemOverview() {
  const [info, setInfo] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    setError('');
    try {
      const [i, s] = await Promise.all([snapshotter.getInfo(), snapshotter.getLastSnapshot()]);
      setInfo(i);
      setSnapshot(s);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        System Status
      </div>
      {!info ? (
        <button className="btn btn-primary" onClick={handleFetch}>Check Status</button>
      ) : (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-value">{info.opsSinceSnapshot}</div>
              <div className="stat-label">Pending Ops</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{info.snapshotCount}</div>
              <div className="stat-label">Snapshots</div>
            </div>
          </div>
          {snapshot && snapshot.snapshot && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
              <strong>Last snapshot:</strong> {snapshot.snapshot.timestamp
                ? new Date(snapshot.snapshot.timestamp).toLocaleString()
                : 'N/A'}
              {snapshot.snapshot.rumorsCount !== undefined && (
                <span> &mdash; {snapshot.snapshot.rumorsCount} rumors, {snapshot.snapshot.usersCount ?? 0} users</span>
              )}
            </div>
          )}
          <button className="btn btn-secondary" onClick={handleFetch} style={{ marginTop: 12 }}>
            &#8635; Refresh
          </button>
        </>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Operation Log ────────────────────────────────────────── */
function OpLogViewer() {
  const [opLog, setOpLog] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true); setError('');
    try {
      const data = await snapshotter.getOpLog();
      setOpLog(data.opLog);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        Activity Log
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>Recent actions recorded on your node.</p>
      {!opLog ? (
        <button className="btn btn-secondary" onClick={handleFetch} disabled={loading}>
          {loading ? <><span className="spinner" /> Loading...</> : 'Load Activity Log'}
        </button>
      ) : (
        <>
          <div style={{ color: '#555', fontSize: 13, marginBottom: 8 }}>
            {opLog.length} operation{opLog.length !== 1 ? 's' : ''} recorded
          </div>
          {opLog.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Type</th><th>Summary</th><th>Time</th></tr>
              </thead>
              <tbody>
                {opLog.slice(-30).reverse().map((op, i) => (
                  <tr key={i}>
                    <td>{op._ingestIndex ?? opLog.length - 1 - i}</td>
                    <td><span className="tag tag-dark">{op.type}</span></td>
                    <td style={{ fontSize: 12, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opSummary(op)}
                    </td>
                    <td style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>
                      {op.timestamp ? new Date(op.timestamp).toLocaleTimeString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#888', fontSize: 13 }}>Log is empty — post some rumors first!</div>
          )}
          <button className="btn btn-secondary" onClick={handleFetch} style={{ marginTop: 12 }}>
            &#8635; Refresh
          </button>
        </>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

function opSummary(op) {
  const p = op.payload || {};
  switch (op.type) {
    case 'JOIN': return `User ${p.nullifier || p.commitment || ''} joined`;
    case 'RUMOR': return p.text ? p.text.substring(0, 60) : `Rumor ${p.id}`;
    case 'VOTE': return `${p.nullifier || 'someone'} voted ${p.vote} on ${p.rumorId}`;
    case 'TOMBSTONE': return `Deleted rumor ${p.rumorId}`;
    default: return JSON.stringify(p).substring(0, 60);
  }
}

/* ── System Config ────────────────────────────────────────── */
function ConfigViewer() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const handleFetch = async () => {
    setError('');
    try { setData(await config.get()); }
    catch (err) { setError(err.message); }
  };

  const sections = data ? Object.entries(data) : [];

  return (
    <div className="card collapsible-card">
      <div className="collapsible-header" onClick={() => { if (!data) handleFetch(); }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          System Configuration
        </div>
        {!data && <span className="collapse-icon">Load &#9660;</span>}
      </div>

      {sections.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {sections.map(([key, value]) => (
            <div key={key} style={{ marginBottom: 6 }}>
              <div className="config-header" onClick={() => setExpanded(expanded === key ? null : key)}>
                <span>{key}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{expanded === key ? '&#9650;' : '&#9660;'}</span>
              </div>
              {expanded === key && (
                <div className="result-box" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}
