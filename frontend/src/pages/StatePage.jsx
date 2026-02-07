import { useState } from 'react';
import { snapshotter, config } from '../api';

export default function StatePage() {
  return (
    <div>
      <div className="page-header">
        <h2>Node Dashboard</h2>
        <p>Local node state, operation log, data management, and configuration</p>
      </div>

      <SystemOverview />
      <OpLogViewer />
      <NodeActions />
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
      <button className="btn btn-primary" onClick={handleFetch}>Refresh Status</button>
      {info && (
        <div className="stats-row" style={{ marginTop: 16 }}>
          <div className="stat-card">
            <div className="stat-value">{info.opsSinceSnapshot}</div>
            <div className="stat-label">Pending Ops</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{info.snapshotCount}</div>
            <div className="stat-label">Snapshots</div>
          </div>
        </div>
      )}
      {snapshot && snapshot.snapshot && (
        <div className="result-box success" style={{ fontSize: 12 }}>
          <strong>Last Snapshot:</strong>{'\n'}{JSON.stringify(snapshot, null, 2)}
        </div>
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
        Operation Log
      </div>
      <button className="btn btn-secondary" onClick={handleFetch} disabled={loading}>
        {loading ? <><span className="spinner" /> Loading...</> : 'Load Log'}
      </button>
      {opLog && (
        <>
          <div style={{ marginTop: 12, color: '#555', fontSize: 13 }}>
            {opLog.length} operation{opLog.length !== 1 ? 's' : ''} recorded
          </div>
          {opLog.length > 0 ? (
            <table className="data-table" style={{ marginTop: 8 }}>
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
            <div style={{ color: '#888', fontSize: 13, marginTop: 8 }}>Log is empty — post some rumors first!</div>
          )}
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

/* ── Node Actions (collapsible) ────────────────────────────── */
function NodeActions() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card collapsible-card">
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Data Management
        </div>
        <span className="collapse-icon">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 20 }}>
          <RebuildTool />
          <div className="divider" />
          <BatchIngestTool />
          <div className="divider" />
          <ExportImportStateTool />
        </div>
      )}
    </div>
  );
}

/* ── Rebuild State ────────────────────────────────────────── */
function RebuildTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRebuild = async () => {
    setLoading(true); setError('');
    try { setResult(await snapshotter.rebuild()); }
    catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Rebuild State from Log</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Replay all operations and rebuild the current state from scratch.</p>
      <button className="btn btn-primary" onClick={handleRebuild} disabled={loading}>
        {loading ? <><span className="spinner" /> Rebuilding...</> : 'Rebuild'}
      </button>
      {result && (
        <>
          <div className="stats-row" style={{ marginTop: 12 }}>
            <div className="stat-card"><div className="stat-value">{result.activeRumors}</div><div className="stat-label">Rumors</div></div>
            <div className="stat-card"><div className="stat-value">{result.totalVotes}</div><div className="stat-label">Votes</div></div>
            <div className="stat-card"><div className="stat-value">{result.registeredUsers}</div><div className="stat-label">Users</div></div>
          </div>
          <div className="result-box success" style={{ fontSize: 12 }}>{JSON.stringify(result.state, null, 2)}</div>
        </>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Batch Ingest ─────────────────────────────────────────── */
function BatchIngestTool() {
  const [opsJson, setOpsJson] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleIngest = async () => {
    setError('');
    try { setResult(await snapshotter.ingestBatch(JSON.parse(opsJson))); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Batch Ingest Operations</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Ingest multiple operations at once (JOIN, RUMOR, VOTE, TOMBSTONE).</p>
      <div className="form-group">
        <label>Operations (JSON Array)</label>
        <textarea rows={5} value={opsJson} onChange={e => setOpsJson(e.target.value)}
          placeholder={'[\n  { "type": "JOIN", "payload": { "commitment": "user1", "nullifier": "user1" }, "timestamp": 1700000000000 }\n]'} />
      </div>
      <button className="btn btn-primary" onClick={handleIngest} disabled={!opsJson}>Ingest</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Export / Import ──────────────────────────────────────── */
function ExportImportStateTool() {
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');
    try {
      const data = await snapshotter.exportData();
      setExportData(JSON.stringify(data.data, null, 2));
      setResult({ action: 'exported', ops: data.data?.opLog?.length || 0 });
    } catch (err) { setError(err.message); }
  };

  const handleImport = async () => {
    setError('');
    try { setResult(await snapshotter.importData(JSON.parse(importData))); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Export / Import State</h4>
      <div className="grid-2">
        <div>
          <button className="btn btn-secondary" onClick={handleExport}>Export</button>
          {exportData && <textarea rows={5} value={exportData} readOnly style={{ marginTop: 12 }} />}
        </div>
        <div>
          <div className="form-group">
            <label>Import Data (JSON)</label>
            <textarea rows={5} value={importData} onChange={e => setImportData(e.target.value)} placeholder="Paste exported data" />
          </div>
          <button className="btn btn-primary" onClick={handleImport} disabled={!importData}>Import</button>
        </div>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
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
        {!data && <span className="collapse-icon">Load ▼</span>}
      </div>

      {sections.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {sections.map(([key, value]) => (
            <div key={key} style={{ marginBottom: 6 }}>
              <div className="config-header" onClick={() => setExpanded(expanded === key ? null : key)}>
                <span>{key}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{expanded === key ? '▲' : '▼'}</span>
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
