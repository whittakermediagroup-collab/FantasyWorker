// nflData.js
// Pulls league-agnostic NFL data (works for Sleeper/Yahoo/ESPN rosters alike):
//   - Sleeper's public player directory + weekly stats (no auth required)
//   - ESPN's public scoreboard for weekly schedule/matchups (no auth required)
//
// Everything here is cached in-memory per page load and lightly cached in
// localStorage so repeat visits in the same day don't re-fetch the ~5MB
// player directory.

const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const PLAYERS_CACHE_KEY = 'fm_sleeper_players_cache';
const PLAYERS_CACHE_TTL_MS = 20 * 60 * 60 * 1000; // 20h, mirrors Draft Command's ADP cache pattern

let playersMemoCache = null;

// --- NFL state (current week) ---
export async function getNflState() {
  const res = await fetch(`${SLEEPER_BASE}/state/nfl`);
  if (!res.ok) throw new Error('Failed to fetch NFL state');
  return res.json(); // { week, season, season_type, ... }
}

// --- Player directory (name/position/team/injury status) ---
export async function getPlayerDirectory() {
  if (playersMemoCache) return playersMemoCache;

  try {
    const cached = localStorage.getItem(PLAYERS_CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < PLAYERS_CACHE_TTL_MS) {
        playersMemoCache = data;
        return data;
      }
    }
  } catch {
    // fall through to re-fetch
  }

  const res = await fetch(`${SLEEPER_BASE}/players/nfl`);
  if (!res.ok) throw new Error('Failed to fetch player directory');
  const data = await res.json();

  playersMemoCache = data;
  try {
    localStorage.setItem(PLAYERS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // localStorage quota can overflow on this large payload - safe to ignore,
    // the in-memory cache still works for this session.
  }
  return data;
}

// Find a Sleeper player_id by name + position (best-effort fuzzy match).
export function findPlayerId(directory, name, position) {
  const target = normalizeName(name);
  let best = null;
  for (const [id, p] of Object.entries(directory)) {
    if (!p.full_name) continue;
    if (position && p.position !== position) continue;
    if (normalizeName(p.full_name) === target) return id;
    if (!best && normalizeName(p.full_name).includes(target)) best = id;
  }
  return best;
}

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[.'-]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv)$/i, '')
    .trim();
}

// --- Weekly stats ---
export async function getWeekStats(season, week) {
  const res = await fetch(`${SLEEPER_BASE}/stats/nfl/regular/${season}/${week}`);
  if (!res.ok) throw new Error(`Failed to fetch stats for week ${week}`);
  return res.json(); // { [player_id]: { pts_ppr, off_snp, tgt, rec, rush_att, ... } }
}

// Pulls the last N completed weeks of stats for a set of player_ids.
export async function getRecentStats(season, currentWeek, playerIds, lookback = 3) {
  const weeks = [];
  for (let w = Math.max(1, currentWeek - lookback); w < currentWeek; w++) weeks.push(w);

  const weekData = await Promise.all(weeks.map((w) => getWeekStats(season, w)));

  const byPlayer = {};
  for (const id of playerIds) {
    const entries = weekData
      .map((wd) => wd[id])
      .filter(Boolean)
      .map((s) => s.pts_ppr ?? 0);
    byPlayer[id] = {
      weeks: entries,
      avg: entries.length ? entries.reduce((a, b) => a + b, 0) / entries.length : 0,
      trend: trendDirection(entries),
    };
  }
  return byPlayer;
}

function trendDirection(pts) {
  if (pts.length < 2) return 'flat';
  const last = pts[pts.length - 1];
  const prevAvg = pts.slice(0, -1).reduce((a, b) => a + b, 0) / (pts.length - 1);
  if (last > prevAvg * 1.15) return 'up';
  if (last < prevAvg * 0.85) return 'down';
  return 'flat';
}

// --- Schedule / opponents for the upcoming week ---
export async function getWeekSchedule(week) {
  const res = await fetch(`${ESPN_SCOREBOARD}?week=${week}`);
  if (!res.ok) throw new Error('Failed to fetch schedule');
  const data = await res.json();
  const matchups = {}; // teamAbbr -> opponentAbbr
  for (const event of data.events || []) {
    const competitors = event.competitions?.[0]?.competitors || [];
    if (competitors.length !== 2) continue;
    const [a, b] = competitors;
    const abbrA = a.team?.abbreviation;
    const abbrB = b.team?.abbreviation;
    if (abbrA && abbrB) {
      matchups[abbrA] = abbrB;
      matchups[abbrB] = abbrA;
    }
  }
  return matchups;
}

// --- Points allowed by position, per defense (matchup difficulty) ---
// Aggregates the last `lookback` weeks of stats, grouping fantasy points
// scored against each defense by the position of the scorer.
export async function getPointsAllowedByPosition(directory, season, currentWeek, lookback = 4) {
  const weeks = [];
  for (let w = Math.max(1, currentWeek - lookback); w < currentWeek; w++) weeks.push(w);

  const schedules = await Promise.all(weeks.map((w) => getWeekSchedule(w)));
  const weekStats = await Promise.all(weeks.map((w) => getWeekStats(season, w)));

  // allowed[teamAbbr][position] = { total, games }
  const allowed = {};
  const bump = (team, pos, pts) => {
    allowed[team] = allowed[team] || {};
    allowed[team][pos] = allowed[team][pos] || { total: 0, games: 0 };
    allowed[team][pos].total += pts;
  };
  const gamesCounted = {}; // `${team}-${pos}-${weekIdx}` guard so we count one game per team/pos/week

  weeks.forEach((w, i) => {
    const schedule = schedules[i];
    const stats = weekStats[i];
    for (const [pid, s] of Object.entries(stats)) {
      const pts = s.pts_ppr;
      if (typeof pts !== 'number') continue;
      const player = directory[pid];
      if (!player || !player.team || !player.position) continue;
      if (!['QB', 'RB', 'WR', 'TE'].includes(player.position)) continue;
      const opponent = schedule[player.team];
      if (!opponent) continue;
      bump(opponent, player.position, pts);
      const key = `${opponent}-${player.position}-${w}`;
      if (!gamesCounted[key]) {
        gamesCounted[key] = true;
        allowed[opponent][player.position].games += 1;
      }
    }
  });

  // Convert to per-game averages, then rank each position 1 (toughest) to 32 (easiest).
  const avgAllowed = {};
  for (const [team, byPos] of Object.entries(allowed)) {
    avgAllowed[team] = {};
    for (const [pos, { total, games }] of Object.entries(byPos)) {
      avgAllowed[team][pos] = games ? total / games : 0;
    }
  }

  const ranks = {}; // ranks[position] = [{ team, avg }] sorted lowest-allowed (toughest) first
  for (const pos of ['QB', 'RB', 'WR', 'TE']) {
    ranks[pos] = Object.entries(avgAllowed)
      .map(([team, byPos]) => ({ team, avg: byPos[pos] ?? null }))
      .filter((r) => r.avg !== null)
      .sort((a, b) => a.avg - b.avg);
  }
  return ranks; // use matchupGrade() below to turn this into easy/medium/hard for a given opponent
}

export function matchupGrade(ranks, position, opponentAbbr) {
  const list = ranks[position];
  if (!list || !list.length) return { grade: 'unknown', rank: null, of: 0 };
  const idx = list.findIndex((r) => r.team === opponentAbbr);
  if (idx === -1) return { grade: 'unknown', rank: null, of: list.length };
  const pct = idx / list.length; // 0 = toughest defense, 1 = easiest
  const grade = pct < 0.33 ? 'hard' : pct > 0.66 ? 'easy' : 'medium';
  return { grade, rank: idx + 1, of: list.length };
}
