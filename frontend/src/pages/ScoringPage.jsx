import { useState } from 'react';
import { useUser } from '../useUser';
import { btsEngine, rbtsEngine, correlationDampener, reputationManager, trustPropagator } from '../api';

export default function ScoringPage() {
  const { user } = useUser();

  return (
    <div>
      <div className="page-header">
        <h2>Reputation & Scores</h2>
        <p>Track your reputation, view community scores, and see how the scoring system works</p>
      </div>

      {/* My reputation quick view */}
      {user && <MyReputation user={user} />}

      {/* Community scoreboard */}
      <CommunityScoreboard />

      {/* Advanced tools */}
      <AdvancedScoringTools />
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
        <span style={{ fontSize: 18 }}>★</span> My Reputation
      </div>
      <button className="btn btn-primary" onClick={handleFetch}>Check My Score</button>
      {data && (
        <div className="stats-row" style={{ marginTop: 16 }}>
          <div className="stat-card">
            <div className="stat-value">{typeof data.score === 'number' ? data.score.toFixed(1) : data.score}</div>
            <div className="stat-label">Score</div>
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
      )}
      {data && (
        <div className="result-box success" style={{ fontSize: 12 }}>
          {JSON.stringify(data, null, 2)}
        </div>
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
        Community Scoreboard
      </div>
      <button className="btn btn-secondary" onClick={handleFetch}>Load All Scores</button>
      {data && (
        <>
          <div className="stats-row" style={{ marginTop: 16 }}>
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
                      <td className="mono">{id}</td>
                      <td><strong>{typeof score === 'number' ? score.toFixed(2) : score}</strong></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#888', fontSize: 13, marginTop: 12 }}>No users registered yet</div>
          )}
        </>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Advanced Scoring Tools (collapsible) ─────────────────── */
function AdvancedScoringTools() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card collapsible-card">
      <div className="collapsible-header" onClick={() => setExpanded(!expanded)}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Advanced Scoring Tools
        </div>
        <span className="collapse-icon">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 20 }}>
          <RegisterUserTool />
          <div className="divider" />
          <LookupUserTool />
          <div className="divider" />
          <StakingTool />
          <div className="divider" />
          <BTSTool />
          <div className="divider" />
          <RBTSTool />
          <div className="divider" />
          <DampenTool />
          <div className="divider" />
          <ApplyScoresTool />
          <div className="divider" />
          <GroupSlashTool />
          <div className="divider" />
          <DecayRecoveryTool />
          <div className="divider" />
          <TrustPropagatorTool />
          <div className="divider" />
          <ExportImportTool />
        </div>
      )}
    </div>
  );
}

/* ── Register User ────────────────────────────────────────── */
function RegisterUserTool() {
  const [nullifierId, setNullifierId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');
    try { setResult(await reputationManager.register(nullifierId)); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Register User in Reputation System</h4>
      <div className="inline-row">
        <div className="form-group">
          <label>User ID</label>
          <input type="text" value={nullifierId} onChange={e => setNullifierId(e.target.value)} placeholder="User identifier" />
        </div>
        <button className="btn btn-primary" onClick={handleRegister} disabled={!nullifierId}>Register</button>
      </div>
      {result && <div className="result-box success">Registered: {result.nullifierId} (Score: {result.score})</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Lookup User ──────────────────────────────────────────── */
function LookupUserTool() {
  const [nullifierId, setNullifierId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleGetScore = async () => {
    setError('');
    try { setResult(await reputationManager.getScore(nullifierId)); }
    catch (err) { setError(err.message); }
  };

  const handleGetUser = async () => {
    setError('');
    try { setResult(await reputationManager.getUser(nullifierId)); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Lookup User Score</h4>
      <div className="form-group">
        <label>User ID</label>
        <input type="text" value={nullifierId} onChange={e => setNullifierId(e.target.value)} placeholder="User identifier" />
      </div>
      <div className="btn-group">
        <button className="btn btn-primary" onClick={handleGetScore} disabled={!nullifierId}>Get Score</button>
        <button className="btn btn-secondary" onClick={handleGetUser} disabled={!nullifierId}>Full Details</button>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Staking ──────────────────────────────────────────────── */
function StakingTool() {
  const [nullifierId, setNullifierId] = useState('');
  const [amount, setAmount] = useState('1');
  const [actionId, setActionId] = useState('');
  const [action, setAction] = useState('vote');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCanStake = async () => {
    setError('');
    try { setResult(await reputationManager.canStake(nullifierId, parseFloat(amount), action)); }
    catch (err) { setError(err.message); }
  };

  const handleLockStake = async () => {
    setError('');
    try { setResult(await reputationManager.lockStake(nullifierId, parseFloat(amount), actionId || `action_${Date.now()}`, action)); }
    catch (err) { setError(err.message); }
  };

  const handleRelease = async () => {
    setError('');
    try { setResult(await reputationManager.releaseLock(nullifierId, actionId)); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Stake Management</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Check, lock, or release reputation stakes for actions.</p>
      <div className="grid-2">
        <div className="form-group">
          <label>User ID</label>
          <input type="text" value={nullifierId} onChange={e => setNullifierId(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Action Type</label>
          <select value={action} onChange={e => setAction(e.target.value)}>
            <option value="vote">Vote</option>
            <option value="post">Post</option>
            <option value="dispute">Dispute</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Amount</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.1" />
        </div>
        <div className="form-group">
          <label>Action ID</label>
          <input type="text" value={actionId} onChange={e => setActionId(e.target.value)} placeholder="e.g. rumor ID" />
        </div>
      </div>
      <div className="btn-group">
        <button className="btn btn-secondary" onClick={handleCanStake} disabled={!nullifierId}>Can Stake?</button>
        <button className="btn btn-primary" onClick={handleLockStake} disabled={!nullifierId}>Lock Stake</button>
        <button className="btn btn-danger" onClick={handleRelease} disabled={!nullifierId || !actionId}>Release</button>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── BTS Calculator ───────────────────────────────────────── */
function BTSTool() {
  const [votesJson, setVotesJson] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const sample = JSON.stringify([
    { vote: { nullifier: 'v1', vote: 'TRUE', prediction: { TRUE: 0.6, FALSE: 0.2, UNVERIFIED: 0.2 }, stakeAmount: 1 }, weight: 1.0 },
    { vote: { nullifier: 'v2', vote: 'TRUE', prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, stakeAmount: 1 }, weight: 1.0 },
  ], null, 2);

  const handleCalc = async () => {
    setError('');
    try { setResult(await btsEngine.calculate(JSON.parse(votesJson))); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Bayesian Truth Serum (BTS)</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Information-theoretic scoring for large groups (30+ voters).</p>
      <div className="form-group">
        <label>Dampened Votes (JSON)</label>
        <textarea rows={5} value={votesJson} onChange={e => setVotesJson(e.target.value)} placeholder={sample} />
      </div>
      <button className="btn btn-primary" onClick={handleCalc} disabled={!votesJson}>Calculate BTS</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── RBTS Calculator ──────────────────────────────────────── */
function RBTSTool() {
  const [votesJson, setVotesJson] = useState('');
  const [rumorId, setRumorId] = useState('');
  const [blockHeight, setBlockHeight] = useState('0');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCalc = async () => {
    setError('');
    try { setResult(await rbtsEngine.calculate(JSON.parse(votesJson), rumorId, parseInt(blockHeight))); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Robust BTS (RBTS)</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Peer-based scoring for small groups (3–30 voters).</p>
      <div className="form-group">
        <label>Dampened Votes (JSON)</label>
        <textarea rows={5} value={votesJson} onChange={e => setVotesJson(e.target.value)} />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Block Height</label>
          <input type="number" value={blockHeight} onChange={e => setBlockHeight(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleCalc} disabled={!votesJson}>Calculate RBTS</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Correlation Dampener ─────────────────────────────────── */
function DampenTool() {
  const [votesJson, setVotesJson] = useState('');
  const [historyJson, setHistoryJson] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDampen = async () => {
    setError('');
    try {
      const votes = JSON.parse(votesJson);
      const history = historyJson ? JSON.parse(historyJson) : {};
      setResult(await correlationDampener.dampen(votes, history));
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Correlation Dampener (Bot Detection)</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Detect suspicious voting patterns and reduce bot influence.</p>
      <div className="form-group">
        <label>Votes (JSON Array)</label>
        <textarea rows={4} value={votesJson} onChange={e => setVotesJson(e.target.value)}
          placeholder='[{ "nullifier": "v1", "vote": "TRUE", "prediction": { "TRUE": 0.6, "FALSE": 0.2, "UNVERIFIED": 0.2 } }]' />
      </div>
      <div className="form-group">
        <label>Vote History (JSON, optional)</label>
        <textarea rows={3} value={historyJson} onChange={e => setHistoryJson(e.target.value)}
          placeholder='{ "v1": [{ "rumorId": "r1", "vote": "TRUE" }] }' />
      </div>
      <button className="btn btn-primary" onClick={handleDampen} disabled={!votesJson}>Dampen</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Apply Scores ─────────────────────────────────────────── */
function ApplyScoresTool() {
  const [voterScoresJson, setVoterScoresJson] = useState('');
  const [rumorId, setRumorId] = useState('');
  const [stakeJson, setStakeJson] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleApply = async () => {
    setError('');
    try {
      const voterScores = JSON.parse(voterScoresJson);
      const stakeAmounts = stakeJson ? JSON.parse(stakeJson) : {};
      setResult(await reputationManager.applyScores(voterScores, rumorId, stakeAmounts));
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Apply Voter Scores</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Reward truthful voters and penalize dishonest ones.</p>
      <div className="form-group">
        <label>Voter Scores (JSON)</label>
        <textarea rows={3} value={voterScoresJson} onChange={e => setVoterScoresJson(e.target.value)}
          placeholder='{ "voter1": 0.5, "voter2": -0.3 }' />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Stake Amounts (JSON, optional)</label>
          <input type="text" value={stakeJson} onChange={e => setStakeJson(e.target.value)}
            placeholder='{ "voter1": 2 }' />
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleApply} disabled={!voterScoresJson || !rumorId}>Apply</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Group Slash ──────────────────────────────────────────── */
function GroupSlashTool() {
  const [nullifiers, setNullifiers] = useState('');
  const [basePenalty, setBasePenalty] = useState('5');
  const [rumorId, setRumorId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSlash = async () => {
    setError('');
    try {
      const arr = nullifiers.split(',').map(s => s.trim()).filter(Boolean);
      setResult(await reputationManager.applyGroupSlash(arr, parseFloat(basePenalty), rumorId));
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Group Slash (Bot Clusters)</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Penalize a group of coordinated/bot accounts.</p>
      <div className="form-group">
        <label>Nullifiers (comma-separated)</label>
        <input type="text" value={nullifiers} onChange={e => setNullifiers(e.target.value)} placeholder="bot1, bot2, bot3" />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Base Penalty</label>
          <input type="number" value={basePenalty} onChange={e => setBasePenalty(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-danger" onClick={handleSlash} disabled={!nullifiers || !rumorId}>Slash Group</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Decay & Recovery ─────────────────────────────────────── */
function DecayRecoveryTool() {
  const [decayRate, setDecayRate] = useState('0.99');
  const [recoveryRate, setRecoveryRate] = useState('0.1');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDecay = async () => {
    setError('');
    try { setResult(await reputationManager.applyDecay(parseFloat(decayRate))); }
    catch (err) { setError(err.message); }
  };

  const handleRecovery = async () => {
    setError('');
    try { setResult(await reputationManager.applyRecovery(parseFloat(recoveryRate))); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Score Decay & Recovery</h4>
      <div className="grid-2">
        <div>
          <div className="form-group">
            <label>Decay Rate</label>
            <input type="number" step="0.01" value={decayRate} onChange={e => setDecayRate(e.target.value)} />
            <div className="hint">score × rate (0.99 = 1% decay)</div>
          </div>
          <button className="btn btn-secondary" onClick={handleDecay}>Apply Decay</button>
        </div>
        <div>
          <div className="form-group">
            <label>Recovery Rate</label>
            <input type="number" step="0.01" value={recoveryRate} onChange={e => setRecoveryRate(e.target.value)} />
            <div className="hint">Boost per cycle for low-score users</div>
          </div>
          <button className="btn btn-secondary" onClick={handleRecovery}>Apply Recovery</button>
        </div>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Trust Propagator ─────────────────────────────────────── */
function TrustPropagatorTool() {
  const [vhJson, setVhJson] = useState('');
  const [shJson, setShJson] = useState('');
  const [seedsJson, setSeedsJson] = useState('');
  const [graphResult, setGraphResult] = useState(null);
  const [pprResult, setPprResult] = useState(null);
  const [error, setError] = useState('');

  const handleBuildGraph = async () => {
    setError('');
    try { setGraphResult(await trustPropagator.buildGraph(JSON.parse(vhJson), JSON.parse(shJson))); }
    catch (err) { setError(err.message); }
  };

  const handlePPR = async () => {
    setError('');
    try {
      const seeds = seedsJson ? JSON.parse(seedsJson) : undefined;
      setPprResult(await trustPropagator.computePPR(JSON.parse(vhJson), JSON.parse(shJson), seeds));
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Trust Propagation (PageRank)</h4>
      <p className="hint" style={{ marginBottom: 12 }}>Build a voter trust graph and compute personalized PageRank scores.</p>
      <div className="form-group">
        <label>Vote History (JSON)</label>
        <textarea rows={4} value={vhJson} onChange={e => setVhJson(e.target.value)}
          placeholder='{ "rumor1": [{ "nullifier": "v1", "vote": "TRUE" }] }' />
      </div>
      <div className="form-group">
        <label>Score History (JSON)</label>
        <textarea rows={3} value={shJson} onChange={e => setShJson(e.target.value)}
          placeholder='{ "rumor1": { "consensus": "TRUE", "voterScores": { "v1": 0.5 } } }' />
      </div>
      <div className="form-group">
        <label>Trust Seeds (JSON, optional)</label>
        <input type="text" value={seedsJson} onChange={e => setSeedsJson(e.target.value)} placeholder='{ "v1": 1.0 }' />
      </div>
      <div className="btn-group">
        <button className="btn btn-secondary" onClick={handleBuildGraph} disabled={!vhJson || !shJson}>Build Graph</button>
        <button className="btn btn-primary" onClick={handlePPR} disabled={!vhJson || !shJson}>Compute PageRank</button>
      </div>
      {graphResult && <div className="result-box success">{JSON.stringify(graphResult, null, 2)}</div>}
      {pprResult && <div className="result-box success">{JSON.stringify(pprResult, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Export / Import ──────────────────────────────────────── */
function ExportImportTool() {
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');
    try {
      const data = await reputationManager.exportData();
      setExportData(JSON.stringify(data.data, null, 2));
      setResult({ action: 'exported' });
    } catch (err) { setError(err.message); }
  };

  const handleImport = async () => {
    setError('');
    try { setResult(await reputationManager.importData(JSON.parse(importData))); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <h4 style={{ marginBottom: 8 }}>Export / Import Reputation Data</h4>
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
