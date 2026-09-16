/**
 * Fantasy Manager Worker
 *
 * Two jobs:
 *  1. /kv/leagues  (GET/PUT)  - persists all 5 teams' rosters across devices
 *  2. /trade-suggest (POST)   - calls the Anthropic API server-side (key never
 *                               touches the browser) to generate trade ideas
 *                               with an estimated acceptance likelihood
 *
 * Bindings required (set in Cloudflare dashboard or wrangler.toml):
 *   - LEAGUES_KV      : a Workers KV namespace
 *   - ANTHROPIC_API_KEY : secret, your Anthropic API key
 *   - ALLOWED_ORIGIN  : (optional) your GitHub Pages origin, e.g.
 *                        https://whittakermediagroup-collab.github.io
 */

const CORS_HEADERS = (origin) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const headers = CORS_HEADERS(origin);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    try {
      if (url.pathname === '/kv/leagues' && request.method === 'GET') {
        const raw = await env.LEAGUES_KV.get('leagues');
        return json({ leagues: raw ? JSON.parse(raw) : [] }, headers);
      }

      if (url.pathname === '/kv/leagues' && request.method === 'PUT') {
        const body = await request.json();
        await env.LEAGUES_KV.put('leagues', JSON.stringify(body.leagues || []));
        return json({ ok: true }, headers);
      }

      if (url.pathname === '/trade-suggest' && request.method === 'POST') {
        const body = await request.json();
        const result = await generateTradeSuggestions(body, env);
        return json(result, headers);
      }

      return json({ error: 'Not found' }, headers, 404);
    } catch (err) {
      return json({ error: String(err) }, headers, 500);
    }
  },
};

function json(obj, headers, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/**
 * body: {
 *   league: { name, myTeam: {name, roster}, opponents: [{name, roster}] },
 *   context: { myTeamAnalysis, opponentAnalyses } // optional pre-computed
 *            performance/matchup summaries per player, so the model isn't
 *            guessing at value from name recognition alone.
 * }
 */
async function generateTradeSuggestions(body, env) {
  const { league, context } = body;
  if (!league?.myTeam?.roster?.length) {
    return { error: 'No roster provided for this league.' };
  }

  const prompt = buildTradePrompt(league, context);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: `Anthropic API error: ${res.status} ${text}` };
  }

  const data = await res.json();
  const textBlock = data.content?.find((c) => c.type === 'text')?.text || '';
  const cleaned = textBlock.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return { error: 'Model did not return valid JSON', raw: textBlock };
  }
}

function buildTradePrompt(league, context) {
  return `You are a fantasy football trade advisor. League: "${league.name}".

MY TEAM (${league.myTeam.name}):
${rosterBlock(league.myTeam.roster)}

OPPONENT TEAMS:
${league.opponents.map((o) => `--- ${o.name} ---\n${rosterBlock(o.roster)}`).join('\n')}

${context ? `PERFORMANCE/MATCHUP CONTEXT (recent scoring, trend, matchup difficulty, injury status where known):\n${JSON.stringify(context, null, 2)}` : ''}

Identify positional surpluses and needs for my team and for each opponent team. Propose up to 4 realistic trade offers I could send, where I am giving up players I have depth at (or lower value at) for players that address a real need on my roster, and that the receiving team would plausibly want based on THEIR roster needs.

For each proposal, give a likelihood-of-acceptance percentage (0-100) reasoning ONLY from roster fit and apparent value balance (not information you don't have, like a manager's personality).

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "proposals": [
    {
      "opponentTeam": "string",
      "iSend": ["Player Name", ...],
      "iReceive": ["Player Name", ...],
      "reasoning": "1-3 sentences on why this fits both sides",
      "acceptanceLikelihood": 0-100,
      "riskNote": "1 sentence on the biggest risk to me in this deal, or empty string if none"
    }
  ]
}`;
}

function rosterBlock(roster) {
  return roster.map((p) => `- ${p.name} (${p.position}, ${p.nflTeam || '?'})`).join('\n');
}
