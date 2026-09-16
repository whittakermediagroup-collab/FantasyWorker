import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { loadLeagues, getWorkerUrl } from '../lib/storage';
import { getNflState, getPlayerDirectory, findPlayerId, getRecentStats, getWeekSchedule, getPointsAllowedByPosition } from '../lib/nflData';
import { buildTeamReports } from '../lib/startSit';
import { buildContext, getTradeSuggestions } from '../lib/aiTrade';

export default function Trades() {
  const { id } = useParams();
  const [league, setLeague] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');
  const [proposals, setProposals] = useState(null);

  useEffect(() => {
    loadLeagues().then((leagues) => setLeague(leagues.find((l) => l.id === id)));
  }, [id]);

  async function runAnalysis() {
    setStatus('loading');
    setError('');
    try {
      if (!getWorkerUrl()) throw new Error('Set your Cloudflare Worker URL on the Settings page first.');
      if (league.opponents.length === 0) throw new Error('Add at least one opponent roster on the Rosters page first.');

      const [state, directory] = await Promise.all([getNflState(), getPlayerDirectory()]);
      const schedule = await getWeekSchedule(state.week || 1);
      const allowedRanks = await getPointsAllowedByPosition(directory, state.season, state.week || 1, 4);

      const deps = { directory, state, schedule, allowedRanks, findPlayerId, getRecentStats };
      const myReports = await buildTeamReports(league.myTeam.roster, deps);
      const opponentReportSets = await Promise.all(
        league.opponents.map((o) => buildTeamReports(o.roster, deps))
      );

      const reportsByTeamName = { [league.myTeam.name]: myReports };
      league.opponents.forEach((o, i) => { reportsByTeamName[o.name] = opponentReportSets[i]; });
      const context = buildContext(league, reportsByTeamName);

      const result = await getTradeSuggestions(league, context);
      if (result.error) throw new Error(result.error);
      setProposals(result.proposals || []);
      setStatus('ready');
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }

  if (!league) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">← Teams</Link>
          <h1>Trade Suggestions — {league.myTeam.name}</h1>
        </div>
        <button className="btn-primary" onClick={runAnalysis} disabled={status === 'loading'}>
          {status === 'loading' ? 'Analyzing…' : 'Generate suggestions'}
        </button>
      </div>

      {status === 'idle' && (
        <p className="muted">Pulls current performance and matchup data for your roster and every opponent roster in this league, then asks the model for realistic trade offers and an estimated chance each one gets accepted.</p>
      )}
      {status === 'error' && <p className="error">{error}</p>}

      {proposals && proposals.length === 0 && status === 'ready' && (
        <p className="muted">No strong trade fits found right now — rosters look balanced.</p>
      )}

      {proposals && proposals.map((p, i) => (
        <section className="panel trade-card" key={i}>
          <div className="trade-card-head">
            <h3>vs. {p.opponentTeam}</h3>
            <span className={`likelihood likelihood-${likelihoodBand(p.acceptanceLikelihood)}`}>
              {p.acceptanceLikelihood}% likely accepted
            </span>
          </div>
          <div className="trade-sides">
            <div>
              <h4>You send</h4>
              <ul>{p.iSend.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
            <div className="trade-arrow">⇄</div>
            <div>
              <h4>You receive</h4>
              <ul>{p.iReceive.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          </div>
          <p className="trade-reasoning">{p.reasoning}</p>
          {p.riskNote && <p className="trade-risk">⚠ {p.riskNote}</p>}
        </section>
      ))}
    </div>
  );
}

function likelihoodBand(pct) {
  if (pct >= 66) return 'high';
  if (pct >= 34) return 'mid';
  return 'low';
}
