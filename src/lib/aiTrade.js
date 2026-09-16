import { getWorkerUrl } from './storage';

// Builds a compact performance/matchup summary per player so the AI isn't
// reasoning off name recognition alone.
export function buildContext(league, reportsByTeamName) {
  const context = {};
  for (const [teamName, reports] of Object.entries(reportsByTeamName)) {
    context[teamName] = reports.map((r) => ({
      name: r.name,
      position: r.position,
      avgPts: r.avgPts,
      trend: r.trend,
      matchupGrade: r.matchup?.grade || 'unknown',
      injuryStatus: r.injuryStatus,
    }));
  }
  return context;
}

export async function getTradeSuggestions(league, context) {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('Set your Cloudflare Worker URL in Settings first.');
  }
  const res = await fetch(`${workerUrl}/trade-suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ league, context }),
  });
  if (!res.ok) throw new Error(`Worker returned ${res.status}`);
  return res.json(); // { proposals: [...] } or { error }
}
