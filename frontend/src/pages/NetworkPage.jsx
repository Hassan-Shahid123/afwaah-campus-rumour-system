import { useState, useEffect } from 'react';
import { network } from '../api';

export default function NetworkPage() {
  return (
    <div>
      <div className="page-header">
        <h2>P2P Network</h2>
        <p>How the peer-to-peer layer works behind the scenes</p>
      </div>

      {/* Live P2P Status */}
      <P2PStatus />

      <div className="card" style={{ padding: 20, background: 'var(--bg-alt)', marginBottom: 24 }}>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#555' }}>
          The network layer runs automatically in the background. When you post a rumor or vote,
          it gets shared with other nodes using <strong>libp2p GossipSub</strong>.
          All nodes stay in sync using <strong>Anti-Entropy Merkle synchronization</strong>.
        </p>
      </div>

      {/* How it works */}
      <div className="card">
        <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
          How Your Data Flows
        </div>
        <div className="flow-steps">
          <div className="flow-step">
            <div className="flow-number">1</div>
            <div>
              <strong>You post or vote</strong>
              <p>Your action is recorded locally and broadcast to the network.</p>
            </div>
          </div>
          <div className="flow-step">
            <div className="flow-number">2</div>
            <div>
              <strong>GossipSub broadcasts it</strong>
              <p>Your message is forwarded to connected peers via publish/subscribe topics.</p>
            </div>
          </div>
          <div className="flow-step">
            <div className="flow-number">3</div>
            <div>
              <strong>Every node validates & stores</strong>
              <p>Each peer validates the message format, ZK proofs, and nullifiers before accepting.</p>
            </div>
          </div>
          <div className="flow-step">
            <div className="flow-number">4</div>
            <div>
              <strong>Anti-Entropy heals gaps</strong>
              <p>Periodic Merkle-root comparisons detect any missing data and sync it between peers.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Topics */}
      <div className="card">
        <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
          Network Topics
        </div>
        <table className="data-table">
          <thead>
            <tr><th>What</th><th>Topic</th><th>When it fires</th></tr>
          </thead>
          <tbody>
            <tr><td>Rumors</td><td className="mono">/afwaah/rumors/1.0</td><td>User posts a new rumor</td></tr>
            <tr><td>Votes</td><td className="mono">/afwaah/votes/1.0</td><td>User votes on a rumor</td></tr>
            <tr><td>Identity</td><td className="mono">/afwaah/identity/1.0</td><td>New user joins the network</td></tr>
            <tr><td>Tombstones</td><td className="mono">/afwaah/tombstone/1.0</td><td>Rumor is deleted</td></tr>
            <tr><td>Sync</td><td className="mono">/afwaah/sync/1.0</td><td>Periodic consistency check</td></tr>
          </tbody>
        </table>
      </div>

      {/* Validation */}
      <div className="card">
        <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
          What Gets Validated
        </div>
        <div className="validation-list">
          <div className="validation-item">
            <span className="validation-check">✓</span>
            <div>
              <strong>Message format</strong>
              <p>Version, type, required fields must all be present and correct.</p>
            </div>
          </div>
          <div className="validation-item">
            <span className="validation-check">✓</span>
            <div>
              <strong>Rumor text length</strong>
              <p>Must be between 1 and 2000 characters. Topic must be in the allowed list.</p>
            </div>
          </div>
          <div className="validation-item">
            <span className="validation-check">✓</span>
            <div>
              <strong>Vote predictions</strong>
              <p>TRUE + FALSE + UNVERIFIED probabilities must sum to 1.0.</p>
            </div>
          </div>
          <div className="validation-item">
            <span className="validation-check">✓</span>
            <div>
              <strong>Nullifier uniqueness</strong>
              <p>Each user can only perform one action per nullifier (prevents double-voting).</p>
            </div>
          </div>
          <div className="validation-item">
            <span className="validation-check">✓</span>
            <div>
              <strong>ZK Proof verification</strong>
              <p>Semaphore proofs confirm the user is a registered member without revealing identity.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Components Reference */}
      <div className="card collapsible-card">
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            Technical API Reference
          </summary>
          <div style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 8 }}>AfwaahNode</h4>
            <table className="data-table">
              <thead><tr><th>Method</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td className="mono">start()</td><td>Start the libp2p node</td></tr>
                <tr><td className="mono">stop()</td><td>Stop the node</td></tr>
                <tr><td className="mono">dial(multiaddr)</td><td>Connect to a peer</td></tr>
                <tr><td className="mono">getConnectedPeers()</td><td>List connected peers</td></tr>
                <tr><td className="mono">getMultiaddrs()</td><td>Get listening addresses</td></tr>
              </tbody>
            </table>

            <h4 style={{ marginTop: 20, marginBottom: 8 }}>GossipController</h4>
            <table className="data-table">
              <thead><tr><th>Method</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td className="mono">publishRumor(payload)</td><td>Broadcast a rumor to the network</td></tr>
                <tr><td className="mono">publishVote(payload)</td><td>Broadcast a vote</td></tr>
                <tr><td className="mono">publishJoin(payload)</td><td>Announce joining the network</td></tr>
                <tr><td className="mono">publishTombstone(payload)</td><td>Broadcast a deletion</td></tr>
                <tr><td className="mono">hasNullifier(n)</td><td>Check if nullifier was already used</td></tr>
              </tbody>
            </table>

            <h4 style={{ marginTop: 20, marginBottom: 8 }}>AntiEntropySync</h4>
            <table className="data-table">
              <thead><tr><th>Method</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td className="mono">startSync()</td><td>Begin periodic synchronization</td></tr>
                <tr><td className="mono">getMerkleRoot()</td><td>Get current state hash</td></tr>
                <tr><td className="mono">handleSyncRequest()</td><td>Respond to peer sync requests</td></tr>
                <tr><td className="mono">getStats()</td><td>Sync statistics</td></tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}

/* ── Live P2P Status Component ────────────────────────────── */
function P2PStatus() {
  const [status, setStatus] = useState(null);
  const [peers, setPeers] = useState(null);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const [s, p] = await Promise.all([network.getStatus(), network.getPeers()]);
      setStatus(s);
      setPeers(p);
      setError('');
    } catch (err) { setError(err.message); }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        Live P2P Node Status
      </div>
      {status ? (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-value" style={{ color: status.started ? '#080' : '#c00' }}>
                {status.started ? '● Online' : '○ Offline'}
              </div>
              <div className="stat-label">Node Status</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{status.peers || 0}</div>
              <div className="stat-label">Connected Peers</div>
            </div>
            {status.peerId && (
              <div className="stat-card">
                <div className="stat-value mono" style={{ fontSize: 11 }}>{status.peerId.substring(0, 20)}...</div>
                <div className="stat-label">Peer ID</div>
              </div>
            )}
          </div>
          {status.multiaddrs?.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
              <strong>Listening addresses:</strong>
              <div style={{ fontFamily: 'monospace', marginTop: 4 }}>
                {status.multiaddrs.map((ma, i) => <div key={i}>{ma}</div>)}
              </div>
            </div>
          )}
          {peers?.peers?.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12 }}>
              <strong>Connected peers:</strong>
              <div style={{ fontFamily: 'monospace', marginTop: 4 }}>
                {peers.peers.map((p, i) => <div key={i}>{p}</div>)}
              </div>
            </div>
          )}
          {status.error && (
            <div className="result-box error" style={{ marginTop: 8, fontSize: 12 }}>
              P2P: {status.error} — running in centralized mode
            </div>
          )}
        </>
      ) : (
        <p style={{ color: '#888' }}>Loading P2P status...</p>
      )}
      {error && <div className="result-box error">{error}</div>}
      <button className="btn btn-secondary" onClick={refresh} style={{ marginTop: 12 }}>↻ Refresh</button>
    </div>
  );
}
