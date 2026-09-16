// startSit.js
// Combines recent performance + matchup difficulty + injury/usage into a
// single comparable score per player, and flags genuinely close calls
// instead of pretending every ranking is confident.

const INJURY_PENALTY = {
  Out: -100, // effectively benched
  Doubtful: -8,
  Questionable: -3,
  IR: -100,
  PUP: -100,
  '': 0,
};

export function buildPlayerReport({ player, sleeperPlayer, recentStats, matchup }) {
  const avg = recentStats?.avg ?? 0;
  const trend = recentStats?.trend ?? 'flat';
  const trendAdj = trend === 'up' ? 1.5 : trend === 'down' ? -1.5 : 0;

  const matchupAdj = matchup?.grade === 'easy' ? 2.5 : matchup?.grade === 'hard' ? -2.5 : 0;

  const status = sleeperPlayer?.injury_status || '';
  const injuryAdj = INJURY_PENALTY[status] ?? 0;

  const score = avg + trendAdj + matchupAdj + injuryAdj;

  return {
    name: player.name,
    position: player.position,
    avgPts: round1(avg),
    trend,
    matchup, // { grade, rank, of }
    injuryStatus: status || 'Healthy',
    score: round1(score),
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Builds reports for an entire roster in one call - shared by the Start/Sit
// page and the trade-suggestion context builder.
export async function buildTeamReports(roster, { directory, state, schedule, allowedRanks, findPlayerId, getRecentStats }) {
  const idMap = roster.map((p) => ({ p, id: findPlayerId(directory, p.name, p.position) }));
  const validIds = idMap.filter((x) => x.id).map((x) => x.id);
  const recentStats = await getRecentStats(state.season, state.week || 1, validIds, 3);

  return idMap.map(({ p, id: pid }) => {
    const sleeperPlayer = pid ? directory[pid] : null;
    const nflTeam = p.nflTeam || sleeperPlayer?.team;
    const opponent = nflTeam ? schedule[nflTeam] : null;
    const matchupInfo = opponent
      ? { grade: gradeFromRanks(allowedRanks, p.position, opponent), opponent }
      : { grade: 'unknown', opponent: null };
    return buildPlayerReport({
      player: p,
      sleeperPlayer,
      recentStats: pid ? recentStats[pid] : null,
      matchup: matchupInfo,
    });
  });
}

function gradeFromRanks(allowedRanks, position, opponent) {
  const list = allowedRanks[position];
  if (!list || !list.length) return 'unknown';
  const idx = list.findIndex((r) => r.team === opponent);
  if (idx === -1) return 'unknown';
  const pct = idx / list.length;
  return pct < 0.33 ? 'hard' : pct > 0.66 ? 'easy' : 'medium';
}

// Groups reports by position and marks recommendation + "close call" flags.
export function rankByPosition(reports) {
  const byPos = {};
  for (const r of reports) {
    byPos[r.position] = byPos[r.position] || [];
    byPos[r.position].push(r);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => b.score - a.score);
    byPos[pos].forEach((r, i) => {
      r.rank = i + 1;
      const next = byPos[pos][i + 1];
      r.closeCall = !!next && Math.abs(r.score - next.score) < 2;
    });
  }
  return byPos;
}
