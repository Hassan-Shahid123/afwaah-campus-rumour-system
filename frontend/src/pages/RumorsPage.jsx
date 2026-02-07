import { useState, useEffect } from 'react';
import { useUser } from '../useUser';
import { snapshotter, tombstoneManager, zkProof } from '../api';

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
        user.emailVerified ? (
          <PostRumor user={user} onPosted={loadRumors} />
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '24px', color: '#888' }}>
            &#9993; <a href="/" style={{ color: '#000', fontWeight: 600 }}>Verify your university email</a> on the Identity page before you can post rumors or vote
          </div>
        )
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

      // Generate ZK proof to prove group membership without revealing identity
      let zkProofData = null;
      try {
        zkProofData = await zkProof.generateProof(user.exportedKey, rumorId, `post_${rumorId}`);
      } catch (zkErr) {
        console.warn('ZK proof generation skipped:', zkErr.message);
      }

      const op = {
        type: 'RUMOR',
        payload: {
          id: rumorId,
          text: text.trim(),
          topic,
          nullifier: zkProofData ? `zk_${zkProofData.nullifier.substring(0, 16)}` : user.nullifier,
          timestamp: Date.now(),
          zkProof: zkProofData || undefined,
        },
        timestamp: Date.now(),
      };
      await snapshotter.ingest(op);
      await tombstoneManager.registerRumor(rumorId, op.payload.nullifier);
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

  // BTS prediction modal state
  const [pendingVote, setPendingVote] = useState(null); // 'TRUE' | 'FALSE' | 'UNVERIFIED' | null
  const [predTrue, setPredTrue] = useState(50);
  const [predFalse, setPredFalse] = useState(30);
  const [predUnsure, setPredUnsure] = useState(20);

  // Count votes by type
  const voteCounts = { TRUE: 0, FALSE: 0, UNVERIFIED: 0 };
  voteList.forEach(v => {
    if (voteCounts[v.vote] !== undefined) voteCounts[v.vote]++;
  });
  const totalVotes = voteList.length;

  // Check if current user already voted
  const userVote = user ? voteList.find(v => v.nullifier === user.nullifier) : null;

  // Check if this is the user's own rumor (prevent self-voting)
  const isOwnRumor = user && rumor.nullifier === user.nullifier;

  const handleVote = async (voteType) => {
    if (!user || voting || userVote) return;
    if (isOwnRumor) return;
    if (!user.emailVerified) return;
    // Step 1: open the BTS prediction prompt
    setPendingVote(voteType);
    // Set sensible defaults based on the chosen vote
    if (voteType === 'TRUE')       { setPredTrue(60); setPredFalse(25); setPredUnsure(15); }
    else if (voteType === 'FALSE') { setPredTrue(25); setPredFalse(60); setPredUnsure(15); }
    else                           { setPredTrue(30); setPredFalse(30); setPredUnsure(40); }
  };

  const cancelPrediction = () => setPendingVote(null);

  const submitVoteWithPrediction = async () => {
    if (!pendingVote) return;
    const total = predTrue + predFalse + predUnsure;
    if (total === 0) { setError('Predictions must add up to more than 0%'); return; }
    setVoting(true); setError('');
    try {
      // Normalize to proportions summing to 1
      const prediction = {
        TRUE: predTrue / total,
        FALSE: predFalse / total,
        UNVERIFIED: predUnsure / total,
      };

      // Generate ZK proof — scope = rumorId ensures 1 vote per identity per rumor
      let zkProofData = null;
      try {
        zkProofData = await zkProof.generateProof(user.exportedKey, pendingVote, `vote_${id}`);
      } catch (zkErr) {
        console.warn('ZK proof generation skipped:', zkErr.message);
      }

      const op = {
        type: 'VOTE',
        payload: {
          rumorId: id,
          vote: pendingVote,
          nullifier: zkProofData ? `zk_${zkProofData.nullifier.substring(0, 16)}` : user.nullifier,
          prediction,
          stakeAmount: 1,
          timestamp: Date.now(),
          zkProof: zkProofData || undefined,
        },
        timestamp: Date.now(),
      };
      await snapshotter.ingest(op);
      setPendingVote(null);
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
        ) : isOwnRumor ? (
          <span style={{ fontSize: 13, color: '#888' }}>You can't vote on your own post</span>
        ) : user && !user.emailVerified ? (
          <span style={{ fontSize: 13, color: '#888' }}>Verify your email to vote</span>
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

      {/* BTS Prediction Panel — appears after user selects a vote */}
      {pendingVote && (
        <div style={{ background: '#f0f7ff', border: '1px solid #b3d4fc', borderRadius: 8, padding: 16, marginTop: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            Your vote: <span style={{ color: pendingVote === 'TRUE' ? '#15803d' : pendingVote === 'FALSE' ? '#dc2626' : '#a16207' }}>{pendingVote}</span>
          </div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
            <strong>Bayesian Truth Serum:</strong> Now predict what % of <em>other voters</em> will pick each option.
            This prediction is used to calculate your BTS score — honest predictions earn higher rewards.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 80, fontSize: 13, fontWeight: 500, color: '#15803d' }}>▲ True</span>
              <input type="range" min={0} max={100} value={predTrue} onChange={e => setPredTrue(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{predTrue}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 80, fontSize: 13, fontWeight: 500, color: '#dc2626' }}>▼ False</span>
              <input type="range" min={0} max={100} value={predFalse} onChange={e => setPredFalse(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{predFalse}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 80, fontSize: 13, fontWeight: 500, color: '#a16207' }}>● Unsure</span>
              <input type="range" min={0} max={100} value={predUnsure} onChange={e => setPredUnsure(Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{predUnsure}%</span>
            </div>
          </div>
          {(predTrue + predFalse + predUnsure) !== 100 && (
            <div style={{ fontSize: 12, color: '#a16207', marginTop: 8 }}>
              Total: {predTrue + predFalse + predUnsure}% — values will be normalized to 100%
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={submitVoteWithPrediction} disabled={voting} style={{ padding: '8px 18px', fontSize: 13 }}>
              {voting ? <><span className="spinner" /> Submitting...</> : 'Submit Vote & Prediction'}
            </button>
            <button className="btn btn-secondary" onClick={cancelPrediction} disabled={voting} style={{ padding: '8px 14px', fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
