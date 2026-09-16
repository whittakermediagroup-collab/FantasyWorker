// storage.js
// Local-first storage for all 5 leagues, with optional sync to a Cloudflare
// Worker (backed by Workers KV) so data persists across devices.
//
// Data model:
// leagues = [
//   {
//     id: 'league_1',
//     name: 'Main Sleeper League',
//     platform: 'sleeper' | 'yahoo' | 'espn',
//     myTeam: { name: 'RJ', roster: [Player, ...] },
//     opponents: [ { name: 'Team B', roster: [Player, ...] }, ... ]
//   }, ...
// ]
// Player = { name, position, nflTeam, byeWeek }

const LOCAL_KEY = 'fm_leagues_v1';
const WORKER_URL_KEY = 'fm_worker_url';

export function getWorkerUrl() {
  return localStorage.getItem(WORKER_URL_KEY) || '';
}

export function setWorkerUrl(url) {
  localStorage.setItem(WORKER_URL_KEY, url.trim().replace(/\/$/, ''));
}

export function loadLocalLeagues() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalLeagues(leagues) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(leagues));
}

// Pulls from the Worker (if configured) and falls back to local data.
// On success, also refreshes the local cache.
export async function loadLeagues() {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return loadLocalLeagues();

  try {
    const res = await fetch(`${workerUrl}/kv/leagues`);
    if (!res.ok) throw new Error(`Worker returned ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.leagues)) {
      saveLocalLeagues(data.leagues);
      return data.leagues;
    }
    return loadLocalLeagues();
  } catch (err) {
    console.warn('Worker sync failed, using local cache:', err);
    return loadLocalLeagues();
  }
}

// Saves locally immediately (so the UI never blocks), then pushes to the
// Worker in the background if configured.
export async function saveLeagues(leagues) {
  saveLocalLeagues(leagues);
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return { synced: false };

  try {
    const res = await fetch(`${workerUrl}/kv/leagues`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leagues }),
    });
    if (!res.ok) throw new Error(`Worker returned ${res.status}`);
    return { synced: true };
  } catch (err) {
    console.warn('Worker sync failed, saved locally only:', err);
    return { synced: false, error: String(err) };
  }
}

export function newLeague() {
  return {
    id: `league_${Date.now()}`,
    name: 'New League',
    platform: 'sleeper',
    myTeam: { name: 'My Team', roster: [] },
    opponents: [],
  };
}

export function newPlayer() {
  return { name: '', position: 'RB', nflTeam: '', byeWeek: '' };
}
