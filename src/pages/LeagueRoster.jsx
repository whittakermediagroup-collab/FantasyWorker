import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { loadLeagues, saveLeagues, newPlayer } from '../lib/storage';
import PlayerAutocomplete from '../components/PlayerAutocomplete';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

export default function LeagueRoster() {
  const { id } = useParams();
  const [leagues, setLeagues] = useState(null);
  const [saveState, setSaveState] = useState('idle');

  useEffect(() => {
    loadLeagues().then(setLeagues);
  }, []);

  const league = leagues?.find((l) => l.id === id);

  async function persist(updated) {
    setLeagues(updated);
    setSaveState('saving');
    const result = await saveLeagues(updated);
    setSaveState(result.synced ? 'synced' : 'local-only');
  }

  function updateLeague(patch) {
    const updated = leagues.map((l) => (l.id === id ? { ...l, ...patch } : l));
    persist(updated);
  }

  function updateTeam(teamKey, opponentIdx, patch) {
    // teamKey: 'myTeam' or 'opponent'
    const updated = leagues.map((l) => {
      if (l.id !== id) return l;
      if (teamKey === 'myTeam') return { ...l, myTeam: { ...l.myTeam, ...patch } };
      const opponents = l.opponents.map((o, i) => (i === opponentIdx ? { ...o, ...patch } : o));
      return { ...l, opponents };
    });
    persist(updated);
  }

  function addOpponent() {
    updateLeague({ opponents: [...league.opponents, { name: `Opponent ${league.opponents.length + 1}`, roster: [] }] });
  }

  function removeOpponent(idx) {
    updateLeague({ opponents: league.opponents.filter((_, i) => i !== idx) });
  }

  if (leagues === null) return <p className="muted">Loading…</p>;
  if (!league) return <p className="muted">League not found. <Link to="/">Back to teams</Link></p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">← Teams</Link>
          <h1>{league.name}</h1>
        </div>
        <span className="save-indicator">{saveIndicatorText(saveState)}</span>
      </div>

      <section className="panel">
        <h3>League info</h3>
        <div className="form-row">
          <label>
            League name
            <input value={league.name} onChange={(e) => updateLeague({ name: e.target.value })} />
          </label>
          <label>
            Platform
            <select value={league.platform} onChange={(e) => updateLeague({ platform: e.target.value })}>
              <option value="sleeper">Sleeper</option>
              <option value="yahoo">Yahoo</option>
              <option value="espn">ESPN</option>
            </select>
          </label>
        </div>
      </section>

      <RosterEditor
        title={`My roster — ${league.myTeam.name}`}
        team={league.myTeam}
        onChangeName={(name) => updateTeam('myTeam', null, { name })}
        onChangeRoster={(roster) => updateTeam('myTeam', null, { roster })}
      />

      <section className="panel">
        <div className="panel-head">
          <h3>Opponent teams (for trade matching)</h3>
          <button className="btn-secondary" onClick={addOpponent}>+ Add opponent</button>
        </div>
        {league.opponents.length === 0 && (
          <p className="muted">Add the teams you'd consider trading with so suggestions can spot real mismatches.</p>
        )}
        {league.opponents.map((opp, idx) => (
          <div key={idx} className="opponent-block">
            <RosterEditor
              title={null}
              team={opp}
              onChangeName={(name) => updateTeam('opponent', idx, { name })}
              onChangeRoster={(roster) => updateTeam('opponent', idx, { roster })}
              onRemove={() => removeOpponent(idx)}
            />
          </div>
        ))}
      </section>
    </div>
  );
}

function RosterEditor({ title, team, onChangeName, onChangeRoster, onRemove }) {
  function addPlayer() {
    onChangeRoster([...team.roster, newPlayer()]);
  }
  function updatePlayer(idx, patch) {
    onChangeRoster(team.roster.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function removePlayer(idx) {
    onChangeRoster(team.roster.filter((_, i) => i !== idx));
  }

  return (
    <section className="panel">
      <div className="panel-head">
        {title ? <h3>{title}</h3> : (
          <input
            className="team-name-input"
            value={team.name}
            onChange={(e) => onChangeName(e.target.value)}
          />
        )}
        <div className="panel-head-actions">
          <button className="btn-secondary" onClick={addPlayer}>+ Add player</button>
          {onRemove && <button className="link-danger" onClick={onRemove}>Remove team</button>}
        </div>
      </div>

      {team.roster.length === 0 && <p className="muted">No players yet.</p>}

      <table className="roster-table">
        <thead>
          <tr><th>Player</th><th>Pos</th><th>NFL team</th><th>Bye</th><th></th></tr>
        </thead>
        <tbody>
          {team.roster.map((p, idx) => (
            <tr key={idx}>
              <td>
                <PlayerAutocomplete
                  value={p.name}
                  placeholder="Start typing a player name"
                  onSelect={(picked) => updatePlayer(idx, picked)}
                />
              </td>
              <td>
                <select value={p.position} onChange={(e) => updatePlayer(idx, { position: e.target.value })}>
                  {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </td>
              <td><input value={p.nflTeam} onChange={(e) => updatePlayer(idx, { nflTeam: e.target.value.toUpperCase() })} placeholder="e.g. KC" maxLength={3} /></td>
              <td><input value={p.byeWeek} onChange={(e) => updatePlayer(idx, { byeWeek: e.target.value })} placeholder="—" style={{ width: '3em' }} /></td>
              <td><button className="link-danger" onClick={() => removePlayer(idx)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function saveIndicatorText(state) {
  if (state === 'saving') return 'Saving…';
  if (state === 'synced') return 'Synced';
  if (state === 'local-only') return 'Saved on this device (Worker not reachable)';
  return '';
}
