import { useState, useEffect } from 'react';
import { useUser } from '../useUser';
import { snapshotter, tombstoneManager } from '../api';

export default function RumorsPage() {
  const { user } = useUser();
  const [rumors, setRumors] = useState({});
  const [votes, setVotes] = useState({});
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRumors = async () => {
    setLoading(true); setError('');
    try {
      const data = await snapshotter.rebuild();
      setRumors(data.state?.rumors || {});
      setVotes(data.state?.votes || {});
      setStats({
        activeRumors: data.activeRumors,
        tombstonedRumors: data.tombstonedRumors,
        totalVotes: data.totalVotes,
        registeredUsers: data.registeredUsers,
      });
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    snapshotter.rebuild().then(data => {
      if (!active) return;
      setRumors(data.state?.rumors || {});
      setVotes(data.state?.votes || {});
      setStats({
        activeRumors: data.activeRumors,
        tombstonedRumors: data.tombstonedRumors,
        totalVotes: data.totalVotes,
        registeredUsers: data.registeredUsers,
      });
      setLoading(false);
    }).catch(err => {
      if (!active) return;
      setError(err.message);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>Campus Feed</h2>
        <p>Browse rumors, vote on what you think is true, and post your own</p>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{stats.activeRumors}</div>
            <div className="stat-label">Active Rumors</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalVotes}</div>
            <div className="stat-label">Total Votes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.registeredUsers}</div>
            <div className="stat-label">Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.tombstonedRumors}</div>
            <div className="stat-label">Removed</div>
          </div>
        </div>
      )}

      {/* Post a new rumor */}
      {user ? (
        <PostRumor user={user} onPosted={loadRumors} />
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '24px', color: '#888' }}>
          &#9670; <a href="/" style={{ color: '#000', fontWeight: 600 }}>Create an account</a> to post rumors and vote
        </div>
      )}

      {/* Refresh button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 12px' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Recent Rumors</h3>
        <button className="btn btn-secondary" onClick={loadRumors} disabled={loading} style={{ padding: '6px 14px', fontSize: 12 }}>
          {loading ? <><span className="spinner" /> Loading...</> : '↻ Refresh'}
        </button>
      </div>

      {error && <div className="result-box error">{error}</div>}

      {/* Rumor Feed */}
      {Object.keys(rumors).length === 0 && !loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#888' }}>
          No rumors yet. Be the first to post one!
        </div>
      ) : (
        Object.entries(rumors)
          .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
          .map(([id, rumor]) => (
            <RumorCard
              key={id}
              id={id}
              rumor={rumor}
              voteList={votes[id] || []}
              user={user}
              onVoted={loadRumors}
            />
          ))
      )}

      {/* Tombstone management */}
      {user && <TombstoneSection user={user} />}
    </div>
  );
}

/* ── Post a Rumor (like Facebook post box) ────────────────── */
function PostRumor({ user, onPosted }) {
  const [text, setText] = useState('');
  const [topic, setTopic] = useState('general');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const topics = ['general', 'academic', 'administration', 'safety', 'events', 'facilities'];

  const handlePost = async () => {
    if (!text.trim()) return;
    setPosting(true); setError('');
    try {
      const rumorId = `rumor_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const op = {
        type: 'RUMOR',
        payload: {
          id: rumorId,
          text: text.trim(),
          topic,
          nullifier: user.nullifier,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };
      await snapshotter.ingest(op);
      await tombstoneManager.registerRumor(rumorId, user.nullifier);
      setText('');
      onPosted();
    } catch (err) { setError(err.message); }
    setPosting(false);
  };

  return (
    <div className="card post-box">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="avatar">{user.nullifier.substring(5, 7).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <textarea
            className="post-input"
            rows={2}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="What's the latest rumor on campus?"
            maxLength={2000}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={topic} onChange={e => setTopic(e.target.value)} className="topic-select">
                {topics.map(t => <option key={t} value={t}>#{t}</option>)}
              </select>
              <span style={{ fontSize: 12, color: '#888' }}>{text.length}/2000</span>
            </div>
            <button className="btn btn-primary" onClick={handlePost} disabled={posting || !text.trim()}>
              {posting ? <><span className="spinner" /> Posting...</> : 'Post Rumor'}
            </button>
          </div>
        </div>
      </div>
      {error && <div className="result-box error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/* ── Rumor Card (like a social media post) ────────────────── */
function RumorCard({ id, rumor, voteList, user, onVoted }) {
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  // Count votes by type
  const voteCounts = { TRUE: 0, FALSE: 0, UNVERIFIED: 0 };
  voteList.forEach(v => {
    if (voteCounts[v.vote] !== undefined) voteCounts[v.vote]++;
  });
  const totalVotes = voteList.length;

  // Check if current user already voted
  const userVote = user ? voteList.find(v => v.nullifier === user.nullifier) : null;

  const handleVote = async (voteType) => {
    if (!user || voting || userVote) return;
    setVoting(true); setError('');
    try {
      // Simple prediction based on vote type
      const predictions = {
        TRUE: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 },
        FALSE: { TRUE: 0.2, FALSE: 0.7, UNVERIFIED: 0.1 },
        UNVERIFIED: { TRUE: 0.2, FALSE: 0.2, UNVERIFIED: 0.6 },
      };

      const op = {
        type: 'VOTE',
        payload: {
          rumorId: id,
          vote: voteType,
          nullifier: user.nullifier,
          prediction: predictions[voteType],
          stakeAmount: 1,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };
      await snapshotter.ingest(op);
      onVoted();
    } catch (err) { setError(err.message); }
    setVoting(false);
  };

  const [now] = useState(() => Date.now());
  const timeAgo = (ts) => {
    if (!ts) return '';
    const diff = now - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="card rumor-card">
      {/* Header */}
      <div className="rumor-header">
        <div className="avatar-sm">{(rumor.nullifier || 'AN').substring(5, 7).toUpperCase()}</div>
        <div>
          <span className="rumor-author">{rumor.nullifier || 'anonymous'}</span>
          <span className="rumor-time">{timeAgo(rumor.timestamp)}</span>
        </div>
        <span className="topic-tag">#{rumor.topic || 'general'}</span>
      </div>

      {/* Content */}
      <div className="rumor-text">{rumor.text}</div>

      {/* Vote bar */}
      {totalVotes > 0 && (
        <div className="vote-bar-container">
          <div className="vote-bar">
            {voteCounts.TRUE > 0 && (
              <div className="vote-bar-segment vote-true" style={{ width: `${(voteCounts.TRUE / totalVotes) * 100}%` }}>
                {Math.round((voteCounts.TRUE / totalVotes) * 100)}%
              </div>
            )}
            {voteCounts.FALSE > 0 && (
              <div className="vote-bar-segment vote-false" style={{ width: `${(voteCounts.FALSE / totalVotes) * 100}%` }}>
                {Math.round((voteCounts.FALSE / totalVotes) * 100)}%
              </div>
            )}
            {voteCounts.UNVERIFIED > 0 && (
              <div className="vote-bar-segment vote-unverified" style={{ width: `${(voteCounts.UNVERIFIED / totalVotes) * 100}%` }}>
                {Math.round((voteCounts.UNVERIFIED / totalVotes) * 100)}%
              </div>
            )}
          </div>
          <div className="vote-legend">
            <span>&#9632; True ({voteCounts.TRUE})</span>
            <span className="legend-false">&#9632; False ({voteCounts.FALSE})</span>
            <span className="legend-unverified">&#9632; Unsure ({voteCounts.UNVERIFIED})</span>
            <span style={{ marginLeft: 'auto', color: '#888' }}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      {/* Vote buttons */}
      <div className="vote-actions">
        {userVote ? (
          <div className="already-voted">✓ You voted: <strong>{userVote.vote}</strong></div>
        ) : user ? (
          <>
            <button className={`vote-btn vote-btn-true ${voting ? 'disabled' : ''}`} onClick={() => handleVote('TRUE')} disabled={voting}>
              ▲ True
            </button>
            <button className={`vote-btn vote-btn-false ${voting ? 'disabled' : ''}`} onClick={() => handleVote('FALSE')} disabled={voting}>
              ▼ False
            </button>
            <button className={`vote-btn vote-btn-unsure ${voting ? 'disabled' : ''}`} onClick={() => handleVote('UNVERIFIED')} disabled={voting}>
              ● Not Sure
            </button>
          </>
        ) : (
          <span style={{ fontSize: 13, color: '#888' }}>Sign in to vote</span>
        )}

        <button className="vote-btn" onClick={() => setShowDetails(!showDetails)} style={{ marginLeft: 'auto' }}>
          {showDetails ? 'Hide Details' : 'Details'}
        </button>
      </div>

      {/* Details (collapsed) */}
      {showDetails && (
        <div className="rumor-details">
          <div><strong>Rumor ID:</strong> <span className="mono">{id}</span></div>
          <div><strong>Author:</strong> <span className="mono">{rumor.nullifier}</span></div>
          <div><strong>Topic:</strong> {rumor.topic}</div>
          {rumor.timestamp && <div><strong>Posted:</strong> {new Date(rumor.timestamp).toLocaleString()}</div>}
          {totalVotes > 0 && <div><strong>Votes:</strong> {JSON.stringify(voteCounts)}</div>}
        </div>
      )}

      {error && <div className="result-box error" style={{ marginTop: 8, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

/* ── Tombstone (Delete Rumor) Section ─────────────────────── */
function TombstoneSection({ user }) {
  const [expanded, setExpanded] = useState(false);
  const [rumorId, setRumorId] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [checkId, setCheckId] = useState('');
  const [allTombstones, setAllTombstones] = useState(null);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setError('');
    try {
      const data = await tombstoneManager.createTombstone(rumorId, user.nullifier, reason || 'author_requested');
      await snapshotter.ingest({
        type: 'TOMBSTONE',
        payload: { rumorId, authorNullifier: user.nullifier, reason: reason || 'author_requested' },
        timestamp: Date.now(),
      });
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  const handleCheck = async () => {
    setError('');
    try { setCheckResult(await tombstoneManager.isTombstoned(checkId)); }
    catch (err) { setError(err.message); }
  };

  const handleGetAll = async () => {
    setError('');
    try { setAllTombstones(await tombstoneManager.getAll()); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card collapsible-card" style={{ marginTop: 24 }}>
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Manage Rumors (Delete / Check Status)
        </div>
        <span className="collapse-icon">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 20 }}>
          {/* Delete your own rumor */}
          <h4 style={{ marginBottom: 8 }}>Delete Your Rumor</h4>
          <p className="hint" style={{ marginBottom: 12 }}>
            You can only delete rumors you posted. Enter the rumor ID from the details view.
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label>Rumor ID</label>
              <input type="text" value={rumorId} onChange={e => setRumorId(e.target.value)}
                placeholder="e.g. rumor_1700000000000_abc" />
            </div>
            <div className="form-group">
              <label>Reason (optional)</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why delete?" />
            </div>
          </div>
          <button className="btn btn-danger" onClick={handleDelete} disabled={!rumorId}>Delete Rumor</button>
          {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}

          <div className="divider" />

          {/* Check if tombstoned */}
          <h4 style={{ marginBottom: 8 }}>Check Rumor Status</h4>
          <div className="inline-row">
            <div className="form-group">
              <label>Rumor ID</label>
              <input type="text" value={checkId} onChange={e => setCheckId(e.target.value)} placeholder="Rumor ID" />
            </div>
            <button className="btn btn-secondary" onClick={handleCheck} disabled={!checkId}>Check</button>
          </div>
          {checkResult && (
            <div className={`result-box ${checkResult.isTombstoned ? 'error' : 'success'}`}>
              {checkResult.isTombstoned ? '✗ This rumor has been deleted' : '✓ This rumor is still active'}
            </div>
          )}

          <div className="divider" />

          {/* List all tombstones */}
          <button className="btn btn-secondary" onClick={handleGetAll}>View All Deleted Rumors</button>
          {allTombstones && (
            <div className="result-box success" style={{ marginTop: 8 }}>
              {allTombstones.count === 0 ? 'No rumors have been deleted yet.'
                : `${allTombstones.count} deleted: ${allTombstones.tombstonedIds.join(', ')}`}
            </div>
          )}

          {error && <div className="result-box error">{error}</div>}
        </div>
      )}
    </div>
  );
}
