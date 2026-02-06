import { useState } from 'react';

export default function NetworkPage() {
  return (
    <div>
      <div className="page-header">
        <h2>Network & P2P</h2>
        <p>AfwaahNode lifecycle, GossipSub messaging, and Anti-Entropy sync — all powered by libp2p</p>
      </div>

      <div style={{ marginBottom: 24, padding: '14px 20px', background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13 }}>
        <strong>Note:</strong> The P2P network (AfwaahNode, GossipController, AntiEntropySync) runs
        peer-to-peer directly in Node.js. This page shows the API interface and lets you understand
        each function. In production, these run on the backend automatically via libp2p.
      </div>

      <NodeSection />
      <GossipControllerSection />
      <AntiEntropySyncSection />
    </div>
  );
}

/* ── AfwaahNode ────────────────────────────────────────────── */
function NodeSection() {
  return (
    <div className="card">
      <div className="card-title">
        AfwaahNode
        <span className="badge">libp2p</span>
      </div>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
        The core P2P node that handles transport, encryption, peer discovery, and pubsub.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Description</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">start()</td>
            <td>Start the libp2p node, begin listening and discovering peers</td>
            <td className="mono">Promise&lt;void&gt;</td>
          </tr>
          <tr>
            <td className="mono">stop()</td>
            <td>Gracefully stop the node and close all connections</td>
            <td className="mono">Promise&lt;void&gt;</td>
          </tr>
          <tr>
            <td className="mono">dial(multiaddr)</td>
            <td>Connect to a peer by multiaddress</td>
            <td className="mono">Promise&lt;Connection&gt;</td>
          </tr>
          <tr>
            <td className="mono">onPeerDiscovery(handler)</td>
            <td>Register callback for peer discovery events</td>
            <td className="mono">void</td>
          </tr>
          <tr>
            <td className="mono">onPeerConnect(handler)</td>
            <td>Register callback for peer connect events</td>
            <td className="mono">void</td>
          </tr>
          <tr>
            <td className="mono">getConnectedPeers()</td>
            <td>Get list of currently connected peer IDs</td>
            <td className="mono">Array&lt;PeerId&gt;</td>
          </tr>
          <tr>
            <td className="mono">getMultiaddrs()</td>
            <td>Get this node's listening multiaddresses</td>
            <td className="mono">Array&lt;Multiaddr&gt;</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 16 }}>
        <span className="tag">Properties:</span>{' '}
        <span className="tag tag-outline">peerId</span>{' '}
        <span className="tag tag-outline">pubsub</span>{' '}
        <span className="tag tag-outline">dht</span>{' '}
        <span className="tag tag-outline">isStarted</span>
      </div>
    </div>
  );
}

/* ── GossipController ──────────────────────────────────────── */
function GossipControllerSection() {
  const [activeTab, setActiveTab] = useState('handlers');

  return (
    <div className="card">
      <div className="card-title">
        GossipController
        <span className="badge">GossipSub</span>
      </div>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
        Manages topic subscriptions, message publishing, validation pipeline, and nullifier tracking.
      </p>

      <div className="btn-group" style={{ marginBottom: 16 }}>
        <button className={`btn ${activeTab === 'handlers' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('handlers')}>
          Handler Registration
        </button>
        <button className={`btn ${activeTab === 'publish' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('publish')}>
          Publishing
        </button>
        <button className={`btn ${activeTab === 'nullifier' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('nullifier')}>
          Nullifier Tracking
        </button>
      </div>

      {activeTab === 'handlers' && (
        <table className="data-table">
          <thead>
            <tr><th>Method</th><th>Topic</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td className="mono">onRumor(handler)</td><td className="mono">/afwaah/rumors/1.0</td><td>Handle incoming rumor messages</td></tr>
            <tr><td className="mono">onVote(handler)</td><td className="mono">/afwaah/votes/1.0</td><td>Handle incoming vote messages</td></tr>
            <tr><td className="mono">onJoin(handler)</td><td className="mono">/afwaah/identity/1.0</td><td>Handle join/identity announcements</td></tr>
            <tr><td className="mono">onTombstone(handler)</td><td className="mono">/afwaah/tombstone/1.0</td><td>Handle tombstone (deletion) messages</td></tr>
            <tr><td className="mono">onSync(handler)</td><td className="mono">/afwaah/sync/1.0</td><td>Handle anti-entropy sync messages</td></tr>
          </tbody>
        </table>
      )}

      {activeTab === 'publish' && (
        <table className="data-table">
          <thead>
            <tr><th>Method</th><th>Payload Schema</th><th>Validation</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">publishRumor(payload)</td>
              <td className="mono">{'{ text, topic, zkProof, nullifier }'}</td>
              <td>version, type, text length, topic enum, zkProof fields</td>
            </tr>
            <tr>
              <td className="mono">publishVote(payload)</td>
              <td className="mono">{'{ rumorId, vote, prediction, nullifier }'}</td>
              <td>vote ∈ [TRUE, FALSE, UNVERIFIED], prediction sums</td>
            </tr>
            <tr>
              <td className="mono">publishJoin(payload)</td>
              <td className="mono">{'{ commitment, zkProof }'}</td>
              <td>version, type, commitment existence</td>
            </tr>
            <tr>
              <td className="mono">publishTombstone(payload)</td>
              <td className="mono">{'{ rumorId, authorNullifier, reason }'}</td>
              <td>version, type, rumorId existence</td>
            </tr>
            <tr>
              <td className="mono">publishSync(payload, type)</td>
              <td className="mono">{'{ data, type }'}</td>
              <td>version, SYNC_REQUEST | SYNC_RESPONSE</td>
            </tr>
          </tbody>
        </table>
      )}

      {activeTab === 'nullifier' && (
        <table className="data-table">
          <thead>
            <tr><th>Method</th><th>Description</th><th>Returns</th></tr>
          </thead>
          <tbody>
            <tr><td className="mono">hasNullifier(nullifier)</td><td>Check if a nullifier has been used</td><td className="mono">boolean</td></tr>
            <tr><td className="mono">addNullifier(nullifier)</td><td>Mark a nullifier as used (prevent double-action)</td><td className="mono">void</td></tr>
            <tr><td className="mono">nullifierCount</td><td>Total tracked nullifiers</td><td className="mono">number</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── AntiEntropySync ───────────────────────────────────────── */
function AntiEntropySyncSection() {
  return (
    <div className="card">
      <div className="card-title">
        AntiEntropySync
        <span className="badge">Merkle Sync</span>
      </div>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
        Merkle-root based state synchronization for eventual consistency between peers.
      </p>

      <table className="data-table">
        <thead>
          <tr><th>Method</th><th>Description</th><th>Returns</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">computeMerkleRoot(entries)</td>
            <td>Compute SHA-256 Merkle root from an array of entries</td>
            <td className="mono">string (hex)</td>
          </tr>
          <tr>
            <td className="mono">updateLocalRoot(storeKey, entries)</td>
            <td>Update the cached Merkle root for a store</td>
            <td className="mono">string (root)</td>
          </tr>
          <tr>
            <td className="mono">getLocalRoot(storeKey)</td>
            <td>Get the cached Merkle root for a store</td>
            <td className="mono">string | null</td>
          </tr>
          <tr>
            <td className="mono">getAllLocalRoots()</td>
            <td>Get all cached store roots</td>
            <td className="mono">Map</td>
          </tr>
          <tr>
            <td className="mono">createSyncRequest(peerId)</td>
            <td>Create a sync request message to send to a peer</td>
            <td className="mono">object</td>
          </tr>
          <tr>
            <td className="mono">handleSyncRequest(request, localData)</td>
            <td>Process incoming sync request, compute deltas</td>
            <td className="mono">object (response)</td>
          </tr>
          <tr>
            <td className="mono">handleSyncResponse(response, peerId)</td>
            <td>Process sync response, merge missing entries</td>
            <td className="mono">object (stats)</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 16 }}>
        <span className="tag">Events:</span>{' '}
        <span className="tag tag-outline">sync-complete</span>{' '}
        <span className="tag tag-outline">entries-received</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <span className="tag">Stats:</span>{' '}
        <span className="tag tag-outline">_syncCount</span>{' '}
        <span className="tag tag-outline">_entriesReceived</span>{' '}
        <span className="tag tag-outline">_entriesSent</span>
      </div>
    </div>
  );
}
