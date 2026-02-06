import { useState } from 'react';
import { btsEngine, rbtsEngine, correlationDampener, reputationManager, trustPropagator } from '../api';

export default function ScoringPage() {
  return (
    <div>
      <div className="page-header">
        <h2>Scoring & Reputation</h2>
        <p>BTS/RBTS scoring, correlation dampening, reputation management, and Personalized PageRank trust propagation</p>
      </div>

      <ReputationOverviewSection />
      <div className="divider" />
      <ReputationRegisterSection />
      <ReputationLookupSection />
      <StakeSection />
      <div className="divider" />
      <CorrelationDampenSection />
      <BTSCalculateSection />
      <RBTSCalculateSection />
      <div className="divider" />
      <ApplyScoresSection />
      <GroupSlashSection />
      <DecayRecoverySection />
      <div className="divider" />
      <TrustPropagatorSection />
      <div className="divider" />
      <ReputationExportImportSection />
    </div>
  );
}

/* ── Reputation Overview ───────────────────────────────────── */
function ReputationOverviewSection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    setError('');
    try { setData(await reputationManager.getAllScores()); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        reputationManager.getAllScores()
        <span className="badge">Overview</span>
      </div>
      <button className="btn btn-primary" onClick={handleFetch}>Fetch All Scores</button>
      {data && (
        <>
          <div className="stats-row" style={{ marginTop: 16 }}>
            <div className="stat-card">
              <div className="stat-value">{data.userCount}</div>
              <div className="stat-label">Total Users</div>
            </div>
          </div>
          {Object.keys(data.scores).length > 0 && (
            <table className="data-table">
              <thead>
                <tr><th>Nullifier ID</th><th>Score</th></tr>
              </thead>
              <tbody>
                {Object.entries(data.scores).map(([id, score]) => (
                  <tr key={id}>
                    <td className="mono">{id}</td>
                    <td><strong>{typeof score === 'number' ? score.toFixed(2) : score}</strong></td>
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

/* ── reputationManager.register() ──────────────────────────── */
function ReputationRegisterSection() {
  const [nullifierId, setNullifierId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');
    try {
      const data = await reputationManager.register(nullifierId);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">reputationManager.register()</div>
      <div className="inline-row">
        <div className="form-group">
          <label>Nullifier ID</label>
          <input type="text" className="input-mono" value={nullifierId} onChange={e => setNullifierId(e.target.value)}
            placeholder="Unique user identifier" />
        </div>
        <button className="btn btn-primary" onClick={handleRegister} disabled={!nullifierId}>Register</button>
      </div>
      {result && <div className="result-box success">{`Registered: ${result.nullifierId}\nInitial Score: ${result.score}`}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── reputationManager.getScore / getUser ──────────────────── */
function ReputationLookupSection() {
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
    <div className="card">
      <div className="card-title">reputationManager.getScore() / getUser()</div>
      <div className="form-group">
        <label>Nullifier ID</label>
        <input type="text" className="input-mono" value={nullifierId} onChange={e => setNullifierId(e.target.value)} />
      </div>
      <div className="btn-group">
        <button className="btn btn-primary" onClick={handleGetScore} disabled={!nullifierId}>Get Score</button>
        <button className="btn btn-secondary" onClick={handleGetUser} disabled={!nullifierId}>Get Full User</button>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Staking ───────────────────────────────────────────────── */
function StakeSection() {
  const [nullifierId, setNullifierId] = useState('');
  const [amount, setAmount] = useState('1');
  const [actionId, setActionId] = useState('');
  const [action, setAction] = useState('vote');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCanStake = async () => {
    setError('');
    try {
      const data = await reputationManager.canStake(nullifierId, parseFloat(amount), action);
      setResult({ check: true, ...data });
    } catch (err) { setError(err.message); }
  };

  const handleLockStake = async () => {
    setError('');
    try {
      const data = await reputationManager.lockStake(nullifierId, parseFloat(amount), actionId || `action_${Date.now()}`, action);
      setResult({ lock: true, ...data });
    } catch (err) { setError(err.message); }
  };

  const handleRelease = async () => {
    setError('');
    try {
      const data = await reputationManager.releaseLock(nullifierId, actionId);
      setResult({ release: true, ...data });
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        Staking
        <span className="badge">canStake / lockStake / releaseLock</span>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Nullifier ID</label>
          <input type="text" className="input-mono" value={nullifierId} onChange={e => setNullifierId(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Action</label>
          <select value={action} onChange={e => setAction(e.target.value)}>
            <option value="vote">vote</option>
            <option value="post">post</option>
            <option value="dispute">dispute</option>
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
          <input type="text" className="input-mono" value={actionId} onChange={e => setActionId(e.target.value)}
            placeholder="e.g. rumorId" />
        </div>
      </div>
      <div className="btn-group">
        <button className="btn btn-secondary" onClick={handleCanStake} disabled={!nullifierId}>Can Stake?</button>
        <button className="btn btn-primary" onClick={handleLockStake} disabled={!nullifierId}>Lock Stake</button>
        <button className="btn btn-danger" onClick={handleRelease} disabled={!nullifierId || !actionId}>Release Lock</button>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── correlationDampener.dampen() ──────────────────────────── */
function CorrelationDampenSection() {
  const [votesJson, setVotesJson] = useState('');
  const [historyJson, setHistoryJson] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const sampleVotes = JSON.stringify([
    { nullifier: 'voter1', vote: 'TRUE', prediction: { TRUE: 0.6, FALSE: 0.2, UNVERIFIED: 0.2 } },
    { nullifier: 'voter2', vote: 'TRUE', prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 } },
    { nullifier: 'voter3', vote: 'FALSE', prediction: { TRUE: 0.3, FALSE: 0.5, UNVERIFIED: 0.2 } },
  ], null, 2);

  const handleDampen = async () => {
    setError('');
    try {
      const votes = JSON.parse(votesJson);
      const history = historyJson ? JSON.parse(historyJson) : {};
      const data = await correlationDampener.dampen(votes, history);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        correlationDampener.dampen()
        <span className="badge">Bot Detection</span>
      </div>
      <div className="form-group">
        <label>Votes (JSON Array)</label>
        <textarea rows={6} value={votesJson} onChange={e => setVotesJson(e.target.value)}
          placeholder={sampleVotes} />
        <div className="hint">Array of {'{ nullifier, vote, prediction }'} objects</div>
      </div>
      <div className="form-group">
        <label>Vote History (JSON Object, optional)</label>
        <textarea rows={4} value={historyJson} onChange={e => setHistoryJson(e.target.value)}
          placeholder='{ "voter1": [{ "rumorId": "r1", "vote": "TRUE" }] }' />
        <div className="hint">Map of nullifier → historical vote array for correlation analysis</div>
      </div>
      <button className="btn btn-primary" onClick={handleDampen} disabled={!votesJson}>Dampen</button>
      {result && (
        <div className="result-box success">
          {JSON.stringify(result, null, 2)}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── btsEngine.calculate() ─────────────────────────────────── */
function BTSCalculateSection() {
  const [votesJson, setVotesJson] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const sampleInput = JSON.stringify([
    { vote: { nullifier: 'v1', vote: 'TRUE', prediction: { TRUE: 0.6, FALSE: 0.2, UNVERIFIED: 0.2 }, stakeAmount: 1 }, weight: 1.0 },
    { vote: { nullifier: 'v2', vote: 'TRUE', prediction: { TRUE: 0.7, FALSE: 0.2, UNVERIFIED: 0.1 }, stakeAmount: 1 }, weight: 1.0 },
    { vote: { nullifier: 'v3', vote: 'FALSE', prediction: { TRUE: 0.3, FALSE: 0.5, UNVERIFIED: 0.2 }, stakeAmount: 1 }, weight: 0.8 },
  ], null, 2);

  const handleCalculate = async () => {
    setError('');
    try {
      const dampenedVotes = JSON.parse(votesJson);
      const data = await btsEngine.calculate(dampenedVotes);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        btsEngine.calculate()
        <span className="badge">N ≥ 30</span>
      </div>
      <div className="form-group">
        <label>Dampened Votes (JSON)</label>
        <textarea rows={8} value={votesJson} onChange={e => setVotesJson(e.target.value)}
          placeholder={sampleInput} />
        <div className="hint">Array of {'{ vote: { nullifier, vote, prediction, stakeAmount }, weight }'}</div>
      </div>
      <button className="btn btn-primary" onClick={handleCalculate} disabled={!votesJson}>Calculate BTS</button>
      {result && (
        <div className="result-box success">
          {`Consensus: ${result.consensus}\nRumor Trust Score: ${result.rumorTrustScore?.toFixed(2)}\n\nActual Proportions:\n  TRUE: ${result.actualProportions.TRUE?.toFixed(4)}\n  FALSE: ${result.actualProportions.FALSE?.toFixed(4)}\n  UNVERIFIED: ${result.actualProportions.UNVERIFIED?.toFixed(4)}\n\nVoter Scores:\n${Object.entries(result.voterScores || {}).map(([k, v]) => `  ${k}: ${v.toFixed(4)}`).join('\n')}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── rbtsEngine.calculate() ────────────────────────────────── */
function RBTSCalculateSection() {
  const [votesJson, setVotesJson] = useState('');
  const [rumorId, setRumorId] = useState('');
  const [blockHeight, setBlockHeight] = useState('0');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleCalculate = async () => {
    setError('');
    try {
      const dampenedVotes = JSON.parse(votesJson);
      const data = await rbtsEngine.calculate(dampenedVotes, rumorId, parseInt(blockHeight));
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        rbtsEngine.calculate()
        <span className="badge">3 ≤ N &lt; 30</span>
      </div>
      <div className="form-group">
        <label>Dampened Votes (JSON)</label>
        <textarea rows={6} value={votesJson} onChange={e => setVotesJson(e.target.value)}
          placeholder="Same format as BTS (array of { vote, weight })" />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Rumor ID (for peer seed)</label>
          <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Block Height</label>
          <input type="number" value={blockHeight} onChange={e => setBlockHeight(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleCalculate} disabled={!votesJson}>Calculate RBTS</button>
      {result && (
        <div className="result-box success">
          {`Consensus: ${result.consensus}\nRumor Trust Score: ${result.rumorTrustScore?.toFixed(2)}\n\nVoter Scores:\n${Object.entries(result.voterScores || {}).map(([k, v]) => `  ${k}: ${v.toFixed(4)}`).join('\n')}\n\nPeer Assignments:\n${Object.entries(result.peerAssignments || {}).map(([k, v]) => `  ${k}: ref=${v.reference}, peer=${v.peer}`).join('\n')}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── reputationManager.applyScores() ───────────────────────── */
function ApplyScoresSection() {
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
      const data = await reputationManager.applyScores(voterScores, rumorId, stakeAmounts);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        reputationManager.applyScores()
        <span className="badge">Reward / Slash</span>
      </div>
      <div className="form-group">
        <label>Voter Scores (JSON Object)</label>
        <textarea rows={4} value={voterScoresJson} onChange={e => setVoterScoresJson(e.target.value)}
          placeholder='{ "voter1": 0.5, "voter2": -0.3 }' />
        <div className="hint">Positive scores = reward, negative = slash</div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Stake Amounts (JSON, optional)</label>
          <input type="text" className="input-mono" value={stakeJson} onChange={e => setStakeJson(e.target.value)}
            placeholder='{ "voter1": 2 }' />
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleApply} disabled={!voterScoresJson || !rumorId}>Apply Scores</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── reputationManager.applyGroupSlash() ───────────────────── */
function GroupSlashSection() {
  const [nullifiers, setNullifiers] = useState('');
  const [basePenalty, setBasePenalty] = useState('5');
  const [rumorId, setRumorId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSlash = async () => {
    setError('');
    try {
      const arr = nullifiers.split(',').map(s => s.trim()).filter(Boolean);
      const data = await reputationManager.applyGroupSlash(arr, parseFloat(basePenalty), rumorId);
      setResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        reputationManager.applyGroupSlash()
        <span className="badge">Bot Cluster</span>
      </div>
      <div className="form-group">
        <label>Group Nullifiers (comma-separated)</label>
        <input type="text" className="input-mono" value={nullifiers} onChange={e => setNullifiers(e.target.value)}
          placeholder="bot1, bot2, bot3" />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label>Base Penalty</label>
          <input type="number" value={basePenalty} onChange={e => setBasePenalty(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Rumor ID</label>
          <input type="text" className="input-mono" value={rumorId} onChange={e => setRumorId(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-danger" onClick={handleSlash} disabled={!nullifiers || !rumorId}>Apply Group Slash</button>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Decay & Recovery ──────────────────────────────────────── */
function DecayRecoverySection() {
  const [decayRate, setDecayRate] = useState('0.99');
  const [recoveryRate, setRecoveryRate] = useState('0.1');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleDecay = async () => {
    setError('');
    try {
      const data = await reputationManager.applyDecay(parseFloat(decayRate));
      setResult({ action: 'decay', ...data });
    } catch (err) { setError(err.message); }
  };

  const handleRecovery = async () => {
    setError('');
    try {
      const data = await reputationManager.applyRecovery(parseFloat(recoveryRate));
      setResult({ action: 'recovery', ...data });
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">Decay & Recovery</div>
      <div className="grid-2">
        <div>
          <div className="form-group">
            <label>Decay Rate</label>
            <input type="number" step="0.01" value={decayRate} onChange={e => setDecayRate(e.target.value)} />
            <div className="hint">score *= rate (e.g. 0.99 = 1% decay)</div>
          </div>
          <button className="btn btn-secondary" onClick={handleDecay}>Apply Decay</button>
        </div>
        <div>
          <div className="form-group">
            <label>Recovery Rate</label>
            <input type="number" step="0.01" value={recoveryRate} onChange={e => setRecoveryRate(e.target.value)} />
            <div className="hint">Boost per cycle for users below initialScore</div>
          </div>
          <button className="btn btn-secondary" onClick={handleRecovery}>Apply Recovery</button>
        </div>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Trust Propagator (PPR) ────────────────────────────────── */
function TrustPropagatorSection() {
  const [voteHistoryJson, setVoteHistoryJson] = useState('');
  const [scoreHistoryJson, setScoreHistoryJson] = useState('');
  const [trustSeedsJson, setTrustSeedsJson] = useState('');
  const [graphResult, setGraphResult] = useState(null);
  const [pprResult, setPprResult] = useState(null);
  const [error, setError] = useState('');

  const sampleVH = JSON.stringify({
    rumor1: [{ nullifier: 'v1', vote: 'TRUE' }, { nullifier: 'v2', vote: 'TRUE' }, { nullifier: 'v3', vote: 'FALSE' }],
  }, null, 2);

  const sampleSH = JSON.stringify({
    rumor1: { consensus: 'TRUE', voterScores: { v1: 0.5, v2: 0.4, v3: -0.2 } },
  }, null, 2);

  const handleBuildGraph = async () => {
    setError('');
    try {
      const vh = JSON.parse(voteHistoryJson);
      const sh = JSON.parse(scoreHistoryJson);
      const data = await trustPropagator.buildGraph(vh, sh);
      setGraphResult(data);
    } catch (err) { setError(err.message); }
  };

  const handleComputePPR = async () => {
    setError('');
    try {
      const vh = JSON.parse(voteHistoryJson);
      const sh = JSON.parse(scoreHistoryJson);
      const seeds = trustSeedsJson ? JSON.parse(trustSeedsJson) : undefined;
      const data = await trustPropagator.computePPR(vh, sh, seeds);
      setPprResult(data);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        trustPropagator — Personalized PageRank
        <span className="badge">PPR</span>
      </div>
      <div className="form-group">
        <label>Vote History (JSON Object)</label>
        <textarea rows={5} value={voteHistoryJson} onChange={e => setVoteHistoryJson(e.target.value)}
          placeholder={sampleVH} />
        <div className="hint">{'{ rumorId: [{ nullifier, vote }] }'}</div>
      </div>
      <div className="form-group">
        <label>Score History (JSON Object)</label>
        <textarea rows={4} value={scoreHistoryJson} onChange={e => setScoreHistoryJson(e.target.value)}
          placeholder={sampleSH} />
        <div className="hint">{'{ rumorId: { consensus, voterScores: { nullifier: score } } }'}</div>
      </div>
      <div className="form-group">
        <label>Trust Seeds (JSON, optional)</label>
        <input type="text" className="input-mono" value={trustSeedsJson} onChange={e => setTrustSeedsJson(e.target.value)}
          placeholder='{ "v1": 1.0 }' />
        <div className="hint">Personalization vector — omit for uniform distribution</div>
      </div>
      <div className="btn-group">
        <button className="btn btn-secondary" onClick={handleBuildGraph} disabled={!voteHistoryJson || !scoreHistoryJson}>
          Build Graph
        </button>
        <button className="btn btn-primary" onClick={handleComputePPR} disabled={!voteHistoryJson || !scoreHistoryJson}>
          Compute PPR
        </button>
      </div>
      {graphResult && (
        <div className="result-box success">
          {`Trust Graph:\n  Nodes: ${graphResult.nodeCount}\n  Edges: ${graphResult.edgeCount}\n  Node List: ${graphResult.nodes?.join(', ')}`}
        </div>
      )}
      {pprResult && (
        <div className="result-box success">
          {`PPR Results (${pprResult.converged ? 'converged' : 'not converged'} in ${pprResult.iterations} iterations):\n\n${Object.entries(pprResult.scores || {}).map(([k, v]) => `  ${k}: ${v.toFixed(6)}`).join('\n')}`}
        </div>
      )}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}

/* ── Reputation Export / Import ─────────────────────────────── */
function ReputationExportImportSection() {
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleExport = async () => {
    setError('');
    try {
      const data = await reputationManager.exportData();
      setExportData(JSON.stringify(data.data, null, 2));
      setResult({ action: 'exported', count: data.data.length });
    } catch (err) { setError(err.message); }
  };

  const handleImport = async () => {
    setError('');
    try {
      const data = JSON.parse(importData);
      const res = await reputationManager.importData(data);
      setResult(res);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <div className="card-title">
        reputationManager — Export / Import
        <span className="badge">Persistence</span>
      </div>
      <div className="grid-2">
        <div>
          <button className="btn btn-secondary" onClick={handleExport}>Export All Data</button>
          {exportData && <textarea rows={6} value={exportData} readOnly style={{ marginTop: 12 }} />}
        </div>
        <div>
          <div className="form-group">
            <label>Import Data (JSON)</label>
            <textarea rows={6} value={importData} onChange={e => setImportData(e.target.value)}
              placeholder="Paste exported data here" />
          </div>
          <button className="btn btn-primary" onClick={handleImport} disabled={!importData}>Import</button>
        </div>
      </div>
      {result && <div className="result-box success">{JSON.stringify(result, null, 2)}</div>}
      {error && <div className="result-box error">{error}</div>}
    </div>
  );
}
