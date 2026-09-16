import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadLeagues, saveLeagues, newLeague } from '../lib/storage';

export default function Dashboard() {
  const [leagues, setLeagues] = useState(null);

  useEffect(() => {
    loadLeagues().then(setLeagues);
  }, []);

  async function addLeague() {
    const updated = [...(leagues || []), newLeague()];
    setLeagues(updated);
    await saveLeagues(updated);
  }

  async function removeLeague(id) {
    if (!confirm('Remove this league and its rosters?')) return;
    const updated = leagues.filter((l) => l.id !== id);
    setLeagues(updated);
    await saveLeagues(updated);
  }

  if (leagues === null) return <p className="muted">Loading your teams…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Your Teams</h1>
        <button className="btn-primary" onClick={addLeague}>+ Add league</button>
      </div>

      {leagues.length === 0 && (
        <p className="muted">No leagues yet. Add your 5 teams to get started.</p>
      )}

      <div className="league-grid">
        {leagues.map((l) => (
          <div key={l.id} className="league-card">
            <div className="league-card-head">
              <span className="platform-tag">{l.platform}</span>
              <button className="link-danger" onClick={() => removeLeague(l.id)}>Remove</button>
            </div>
            <h2>{l.name}</h2>
            <p className="muted">{l.myTeam.name} · {l.myTeam.roster.length} players · {l.opponents.length} opponents tracked</p>
            <div className="league-card-actions">
              <Link to={`/league/${l.id}/roster`}>Rosters</Link>
              <Link to={`/league/${l.id}/start-sit`}>Start/Sit</Link>
              <Link to={`/league/${l.id}/trades`}>Trades</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
