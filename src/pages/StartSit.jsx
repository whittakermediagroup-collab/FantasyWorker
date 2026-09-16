import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { loadLeagues } from '../lib/storage';
import {
  getNflState,
  getPlayerDirectory,
  findPlayerId,
  getRecentStats,
  getWeekSchedule,
  getPointsAllowedByPosition,
  matchupGrade,
} from '../lib/nflData';
import { buildPlayerReport, rankByPosition } from '../lib/startSit';

export default function StartSit() {
  const { id } = useParams();
  const [league, setLeague] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [byPos, setByPos] = useState(null);
  const [week, setWeek] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leagues = await loadLeagues();
      const l = leagues.find((lg) => lg.id === id);
      if (cancelled) return;
      setLeague(l);
      if (!l || l.myTeam.roster.length === 0) {
        setStatus('ready');
        return;
      }
      try {
        const [state, directory] = await Promise.all([getNflState(), getPlayerDirectory()]);
        const currentWeek = state.week || 1;
        setWeek(currentWeek);

        const roster = l.myTeam.roster;
        const idMap = roster.map((p) => ({ p, id: findPlayerId(directory, p.name, p.position) }));

        const validIds = idMap.filter((x) => x.id).map((x) => x.id);
        const [recentStats, schedule, allowedRanks] = await Promise.all([
          getRecentStats(state.season, currentWeek, validIds, 3),
          getWeekSchedule(currentWeek),
          getPointsAllowedByPosition(directory, state.season, currentWeek, 4),
        ]);

        const reports = idMap.map(({ p, id: pid }) => {
          const sleeperPlayer = pid ? directory[pid] : null;
          const nflTeam = p.nflTeam || sleeperPlayer?.team;
          const opponent = nflTeam ? schedule[nflTeam] : null;
          const matchup = opponent ? matchupGrade(allowedRanks, p.position, opponent) : { grade: 'unknown', rank: null, of: 0 };
          return buildPlayerReport({
            player: p,
            sleeperPlayer,
            recentStats: pid ? recentStats[pid] : null,
            matchup: { ...matchup, opponent },
          });
        });

        if (cancelled) return;
        setByPos(rankByPosition(reports));
        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (status === 'loading') return <p className="muted">Pulling recent performance, matchups, and injury data…</p>;
  if (!league) return <p className="muted">League not found. <Link to="/">Back to teams</Link></p>;
  if (league.myTeam.roster.length === 0) {
    return <p className="muted">Add your roster first on the <Link to={`/league/${id}/roster`}>Rosters</Link> page.</p>;
  }
  if (status === 'error') {
    return <p className="error">Couldn't load matchup data: {error}. This usually means a player name didn't match — double check spelling on the roster page.</p>;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">← Teams</Link>
          <h1>Start/Sit — {league.myTeam.name}</h1>
        </div>
        {week && <span className="muted">Week {week}</span>}
      </div>

      {Object.entries(byPos).map(([pos, players]) => (
        <section className="panel" key={pos}>
          <h3>{pos}</h3>
          <table className="roster-table">
            <thead>
              <tr><th>Rank</th><th>Player</th><th>Avg pts (L3)</th><th>Trend</th><th>Matchup</th><th>Status</th><th>Score</th></tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.name} className={p.rank === 1 ? 'row-start' : ''}>
                  <td>{p.rank === 1 ? 'Start' : 'Bench'}</td>
                  <td>{p.name}{p.closeCall && <span className="pill pill-close">close call</span>}</td>
                  <td>{p.avgPts}</td>
                  <td className={`trend-${p.trend}`}>{trendLabel(p.trend)}</td>
                  <td>{matchupLabel(p.matchup)}</td>
                  <td className={p.injuryStatus !== 'Healthy' ? 'injury-flag' : ''}>{p.injuryStatus}</td>
                  <td>{p.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function trendLabel(t) {
  if (t === 'up') return '↑ Up';
  if (t === 'down') return '↓ Down';
  return '– Flat';
}

function matchupLabel(m) {
  if (!m || m.grade === 'unknown') return 'Unknown';
  const label = m.grade === 'easy' ? 'Favorable' : m.grade === 'hard' ? 'Tough' : 'Average';
  return `${label}${m.opponent ? ` vs ${m.opponent}` : ''}${m.rank ? ` (#${m.rank}/${m.of})` : ''}`;
}
