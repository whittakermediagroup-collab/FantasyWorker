# Fantasy Manager

Weekly in-season tool covering all 5 of your fantasy teams: manual roster entry,
start/sit recommendations off real performance + matchup + injury data, and
AI-generated trade suggestions with an acceptance-likelihood estimate.

## How it works

- **Rosters** - entered by hand for all 5 teams (and their opponents, for trade
  matching). Saved to your browser immediately, and synced to Workers KV via
  the Cloudflare Worker if you set that up (see below), so it follows you
  across devices.
- **Start/Sit** - pulls each player's last 3 weeks of scoring, this week's
  opponent, and how tough that opponent's defense has been against that
  position (from free public Sleeper + ESPN data - works regardless of
  whether that league is on Sleeper, Yahoo, or ESPN).
- **Trades** - sends your roster + your opponents' rosters + the same
  performance/matchup context to the Anthropic API (via the Worker, so the
  key never touches the browser) and gets back concrete trade offers with a
  reasoned acceptance-likelihood %.

## 1. Deploy the site (GitHub Pages)

```bash
# from this folder
git init
git add .
git commit -m "Fantasy Manager v1"
gh repo create fantasy-manager --public --source=. --push
```

Then in the new repo: Settings -> Pages -> Build and deployment -> Source: GitHub Actions.
The included workflow (.github/workflows/deploy.yml) builds and deploys on every push to main.
Your site will be live at https://<your-username>.github.io/fantasy-manager/

## 2. Deploy the Cloudflare Worker

This is what enables cross-device sync and AI trade suggestions. Skip it and the
site still works fully for start/sit on one device - trades and sync just won't.

```bash
cd cloudflare-worker
npm install -g wrangler   # if you don't have it already
wrangler login
wrangler kv namespace create LEAGUES_KV
# copy the returned namespace id into a wrangler.toml (see below)
wrangler secret put ANTHROPIC_API_KEY   # paste your Anthropic API key when prompted
wrangler deploy fantasy-manager-worker.js
```

Create cloudflare-worker/wrangler.toml:

```toml
name = "fantasy-manager-worker"
main = "fantasy-manager-worker.js"
compatibility_date = "2026-09-01"

kv_namespaces = [
  { binding = "LEAGUES_KV", id = "<id from the create command above>" }
]

[vars]
ALLOWED_ORIGIN = "https://<your-username>.github.io"
```

wrangler deploy prints your Worker URL (something like
https://fantasy-manager-worker.<your-subdomain>.workers.dev).

## 3. Connect the site to the Worker

On the deployed site, go to Settings and paste the Worker URL in. That's it -
rosters now sync across devices, and the Trades page becomes usable.

## Local development

```bash
npm install
npm run dev
```

## Notes

- Player name matching against Sleeper's directory is best-effort (fuzzy match
  on normalized name + position). If a player's row shows "Unknown" matchup
  data, double-check the spelling on the Rosters page.
- The matchup difficulty grade is a live 4-week rolling calculation, not a
  static preseason ranking, so it moves as the season goes.
