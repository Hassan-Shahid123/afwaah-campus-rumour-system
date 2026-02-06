import { useState } from 'react';
import { snapshotter, config } from '../api';

export default function StatePage() {
  return (
    <div>
      <div className="page-header">
        <h2>State & Admin</h2>
        <p>Snapshotter OpLog management, state rebuild, import/export, and system configuration</p>
      </div>

      <StateInfoSection />
      <OpLogSection />
      <IngestBatchSection />
      <RebuildSection />
      <div className="divider" />
      <StateExportImportSection />
      <div className="divider" />
      <ConfigSection />
    </div>
  );
}

/* ── State Info ─────────────────────────────────────────────── */
function StateInfoSection() {
  const [info, setInfo] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  const handleFetchInfo = async () => {
    setError('');
    try { setInfo(await snapshotter.getInfo()); }
    catch (err) { setError(err.message); }
  };

  const handleFetchSnapshot = async () => {
    setError('');
    try { setSnapshot(await snapshotter.getLastSnapshot()); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        Snapshotter — Status
        <span className="badge">State Manager</span>
      </div>
      <div className="btn-group">
        <button className="btn btn-primary" onClick={handleFetchInfo}>Get Info</button>
        <button className="btn btn-secondary" onClick={handleFetchSnapshot}>Get Last Snapshot</button>
      </div>
      {info && (
        <div className="stats-row" style={{ marginTop: 16 }}>
          <div className="stat-card">
            <div className="stat-value">{info.opsSinceSnapshot}</div>
            <div className="stat-label">Ops Since Snapshot</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{info.snapshotCount}</div>
            <div className="stat-label">Total Snapshots</div>
          </div>
        </div>
      )}
      {snapshot && (
        <div className="result-box success">
          {snapshot.snapshot === null
            ? 'No snapshots taken yet'
            : JSON.stringify(snapshot, null, 2)}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── OpLog Viewer ──────────────────────────────────────────── */
function OpLogSection() {
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
      <div className="card-title">
        snapshotter.getOpLog()
        <span className="badge">Immutable Log</span>
      </div>
      <button className="btn btn-primary" onClick={handleFetch} disabled={loading}>
        {loading && <span className="spinner" />} Fetch OpLog
      </button>
      {opLog && (
        <>
          <div style={{ marginTop: 12, marginBottom: 8, fontSize: 13, color: '#555' }}>
            {opLog.length} operations in the log
          </div>
          {opLog.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Type</th><th>Payload</th><th>Timestamp</th></tr>
              </thead>
              <tbody>
                {opLog.slice(-50).map((op, i) => (
                  <tr key={i}>
                    <td>{op._ingestIndex ?? i}</td>
                    <td><span className="tag tag-dark">{op.type}</span></td>
                    <td className="mono" style={{ fontSize: 11, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {JSON.stringify(op.payload).substring(0, 120)}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {op.timestamp ? new Date(op.timestamp).toLocaleTimeString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#888', fontSize: 13, marginTop: 8 }}>OpLog is empty — submit rumors and votes first</div>
          )}
        </>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Batch Ingest ──────────────────────────────────────────── */
function IngestBatchSection() {
  const [opsJson, setOpsJson] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const sampleOps = JSON.stringify([
    { type: 'JOIN', payload: { commitment: 'user_A', nullifier: 'user_A' }, timestamp: 1700000000000 },
    { type: 'RUMOR', payload: { id: 'r1', text: 'Test rumor', topic: 'general', nullifier: 'user_A' }, timestamp: 1700000000000 },
    { type: 'VOTE', payload: { rumorId: 'r1', vote: 'TRUE', nullifier: 'user_A', prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 } }, timestamp: 1700000000000 },
  ], null, 2);

  const handleIngest = async () => {
    setError('');
    try {
      const ops = JSON.parse(opsJson);
      const data = await snapshotter.ingestBatch(ops);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        snapshotter.ingestBatch()
        <span className="badge">Bulk</span>
      </div>
      <div className="form-group">
        <label>Operations (JSON Array)</label>
        <textarea rows={8} value={opsJson} onChange={e => setOpsJson(e.target.value)}
          placeholder={sampleOps} />
        <div className="hint">Array of {'{ type, payload, timestamp }'} — types: JOIN, RUMOR, VOTE, TOMBSTONE</div>
      </div>
      <button className="btn btn-primary" onClick={handleIngest} disabled={!opsJson}>Ingest Batch</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Rebuild ───────────────────────────────────────────────── */
function RebuildSection() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRebuild = async () => {
    setLoading(true); setError('');
    try {
      const data = await snapshotter.rebuild();
      setResult(data);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div className="card">
      <div className="card-title">
        snapshotter.rebuild()
        <span className="badge">Full Rebuild</span>
      </div>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
        Walk the entire OpLog, skip tombstoned entries, and rebuild the materialized view from scratch.
      </p>
      <button className="btn btn-primary" onClick={handleRebuild} disabled={loading}>
        {loading && <span className="spinner" />} Rebuild State
      </button>
      {result && (
        <>
          <div className="stats-row" style={{ marginTop: 16 }}>
            <div className="stat-card">
              <div className="stat-value">{result.snapshotId}</div>
              <div className="stat-label">Snapshot #</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.opLogLength}</div>
              <div className="stat-label">OpLog Length</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.activeRumors}</div>
              <div className="stat-label">Active Rumors</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.registeredUsers}</div>
              <div className="stat-label">Users</div>
            </div>
          </div>
          <div className="result-box success">
            {JSON.stringify(result.state, null, 2)}
          </div>
        </>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── State Export / Import ─────────────────────────────────── */
function StateExportImportSection() {
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');
    try {
      const data = await snapshotter.exportData();
      setExportData(JSON.stringify(data.data, null, 2));
      setResult({ action: 'exported', opLogLength: data.data.opLog?.length });
    } catch (err) { setError(err.message); }
  };

  const handleImport = async () => {
    setError('');
    try {
      const data = JSON.parse(importData);
      const res = await snapshotter.importData(data);
      setResult(res);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        snapshotter — Export / Import
        <span className="badge">Persistence</span>
      </div>
      <div className="grid-2">
        <div>
          <button className="btn btn-secondary" onClick={handleExport}>Export State</button>
          {exportData && <textarea rows={8} value={exportData} readOnly style={{ marginTop: 12 }} />}
        </div>
        <div>
          <div className="form-group">
            <label>Import Data (JSON)</label>
            <textarea rows={8} value={importData} onChange={e => setImportData(e.target.value)}
              placeholder="Paste exported state data here" />
          </div>
          <button className="btn btn-primary" onClick={handleImport} disabled={!importData}>Import & Rebuild</button>
        </div>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── System Configuration ──────────────────────────────────── */
function ConfigSection() {
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
    <div className="card">
      <div className="card-title">
        System Configuration
        <span className="badge">config.js</span>
      </div>
      <button className="btn btn-primary" onClick={handleFetch}>Load Config</button>
      {sections.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {sections.map(([key, value]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div
                onClick={() => setExpanded(expanded === key ? null : key)}
                style={{
                  padding: '10px 14px',
                  background: '#f5f5f5',
                  border: '1px solid #e0e0e0',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{key}</span>
                <span style={{ fontSize: 11, color: '#888' }}>
                  {expanded === key ? '▲ collapse' : '▼ expand'}
                </span>
              </div>
              {expanded === key && (
                <div className="result-box" style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                  {typeof value === 'object'
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
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
