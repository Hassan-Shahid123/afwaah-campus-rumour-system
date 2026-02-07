import { useState } from 'react';
import { useUser } from '../useUser';
import { reputationManager, scoreFinalization } from '../api';

export default function ScoringPage() {
  const { user } = useUser();

  return (
    <div>
      <div className="page-header">
        <h2>Reputation & Scores</h2>
        <p>Track your reputation and see how the community rates rumors</p>
      </div>

      {user && <MyReputation user={user} />}
      <CommunityScoreboard />
      <FinalizedRumors />
      <HowScoringWorks />
    </div>
  );
}

/* ── My Reputation ────────────────────────────────────────── */
function MyReputation({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    setError('');
    try { setData(await reputationManager.getUser(user.nullifier)); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        <span style={{ fontSize: 18 }}>&#9733;</span> My Reputation
      </div>
      {!data ? (
        <button className="btn btn-primary" onClick={handleFetch}>Check My Score</button>
      ) : (
        <>
          <div className="stats-row" style={{ marginTop: 4 }}>
            <div className="stat-card">
              <div className="stat-value">{typeof data.score === 'number' ? data.score.toFixed(1) : data.score}</div>
              <div className="stat-label">Reputation Score</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.lockedStake !== undefined ? data.lockedStake.toFixed(1) : '0'}</div>
              <div className="stat-label">Staked</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.flags?.length || 0}</div>
              <div className="stat-label">Flags</div>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={handleFetch} style={{ marginTop: 12 }}>
            &#8635; Refresh
          </button>
        </>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Community Scoreboard ─────────────────────────────────── */
function CommunityScoreboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    setError('');
    try { setData(await reputationManager.getAllScores()); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        Community Leaderboard
      </div>
      {!data ? (
        <button className="btn btn-secondary" onClick={handleFetch}>Load Leaderboard</button>
      ) : (
        <>
          <div className="stats-row" style={{ marginBottom: 12 }}>
            <div className="stat-card">
              <div className="stat-value">{data.userCount}</div>
              <div className="stat-label">Total Users</div>
            </div>
          </div>
          {Object.keys(data.scores).length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>User</th><th>Score</th></tr>
              </thead>
              <tbody>
                {Object.entries(data.scores)
                  .sort((a, b) => (typeof b[1] === 'number' ? b[1] : 0) - (typeof a[1] === 'number' ? a[1] : 0))
                  .map(([id, score], i) => (
                    <tr key={id}>
                      <td>{i + 1}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{id.length > 20 ? id.substring(0, 20) + '...' : id}</td>
                      <td><strong>{typeof score === 'number' ? score.toFixed(2) : score}</strong></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#888', fontSize: 13 }}>No users registered yet. Post a rumor or vote to get started!</div>
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

/* ── Finalized Rumor Scores ───────────────────────────────── */
function FinalizedRumors() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    setError('');
    try { setData(await scoreFinalization.getAllFinalized()); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        &#128274; Settled Rumors
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Rumors whose scores have been finalized and permanently locked.
      </p>
      {!data ? (
        <button className="btn btn-secondary" onClick={handleFetch}>Load Settled Rumors</button>
      ) : data.count > 0 ? (
        <>
          <table className="data-table">
            <thead>
              <tr><th>Rumor</th><th>Consensus</th><th>Score</th><th>Voters</th><th>Settled</th></tr>
            </thead>
            <tbody>
              {Object.entries(data.scores).map(([id, s]) => (
                <tr key={id}>
                  <td className="mono" style={{ fontSize: 11 }}>{id.length > 24 ? id.substring(0, 24) + '...' : id}</td>
                  <td><span className="tag tag-dark">{s.consensus}</span></td>
                  <td><strong>{typeof s.score === 'number' ? s.score.toFixed(1) : s.score}</strong></td>
                  <td>{s.voterCount}</td>
                  <td style={{ fontSize: 12, color: '#888' }}>{new Date(s.finalizedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-secondary" onClick={handleFetch} style={{ marginTop: 12 }}>
            &#8635; Refresh
          </button>
        </>
      ) : (
        <div style={{ color: '#888', fontSize: 13 }}>No rumors have been settled yet.</div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── How Scoring Works ────────────────────────────────────── */
function HowScoringWorks() {
  return (
    <div className="card" style={{ background: 'var(--bg-alt)' }}>
      <div className="card-title" style={{ textTransform: 'none', letterSpacing: 0 }}>
        How Scoring Works
      </div>
      <div className="flow-steps">
        <div className="flow-step">
          <div className="flow-number">1</div>
          <div>
            <strong>You vote &amp; predict</strong>
            <p>Cast your vote (TRUE / FALSE / UNVERIFIED) and predict what others will say.</p>
          </div>
        </div>
        <div className="flow-step">
          <div className="flow-number">2</div>
          <div>
            <strong>Bayesian Truth Serum</strong>
            <p>Your prediction accuracy is scored — being honest is the best strategy, even if you're in the minority.</p>
          </div>
        </div>
        <div className="flow-step">
          <div className="flow-number">3</div>
          <div>
            <strong>Bot detection</strong>
            <p>Correlation dampening reduces the weight of suspicious voting patterns (copy-paste bots).</p>
          </div>
        </div>
        <div className="flow-step">
          <div className="flow-number">4</div>
          <div>
            <strong>Reputation updates</strong>
            <p>Honest voters gain reputation; dishonest ones lose it. High-reputation votes carry more weight.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
