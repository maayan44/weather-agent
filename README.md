# Weather Risk Intelligence Agent

A chat agent that helps analysts decide which of 10 US logistics hubs are most exposed to weather disruption.
The risk score comes from a fixed formula in code. The LLM only picks tools and explains the results.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design. [PLAN.md](PLAN.md) has the 2-session plan.

## Status

| Part | State |
|---|---|
| Backend scaffold + 10 hubs config | Done |
| Data layer (Open-Meteo, FEMA, SQLite cache) | Done |
| Scoring engine (5 sub-scores + composite) | Done |
| Agent (6 tools + JSON schema + answer checks) | Done and working live with Claude |
| Eval questions (10, spec only) | Done: `backend/evals/questions.ts` |
| First live Claude call | Done |
| API endpoint + conversation history + load data on startup | Done, checked live |
| Backend on Railway | Done: live and checked, data survives redeploys |
| Eval runner (`npm run eval`) | Done: 12/12 cases pass on live Claude (12 questions: the first 10 plus 2 from real user feedback) |
| `GET /ranking` endpoint (no AI call) | Done |
| Chat UI (mobile first) + Overview screen | Built and tested locally; not deployed yet |
| Frontend deploy on Vercel | Done: https://weather-agent-theta-ten.vercel.app (loads, reads the backend, no console errors) |

## Requirements

- Node.js 22 or newer
- An Anthropic API key (only needed to talk to the agent, not for scoring or tests)

## Setup

```bash
cd backend
npm install
cp .env.example .env     # then fill in ANTHROPIC_API_KEY
```

### Environment variables (`backend/.env`)

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | API port | `3000` |
| `ANTHROPIC_API_KEY` | Your Claude API key | none (required for the agent) |
| `ANTHROPIC_MODEL` | Claude model the agent uses | `claude-opus-5-5` |
| `DB_PATH` | SQLite file location | `./data/weather.db` |
| `FRONTEND_ORIGIN` | Allowed CORS origin (the Vercel URL in production) | `*` |

## Run the backend

```bash
cd backend
npm run ingest    # first time: downloads weather + FEMA data into SQLite (~10 seconds)
npm run dev       # starts the API with auto-reload
```

On startup the server downloads any missing data in the background (about 5-10 seconds when the database is empty),
so `npm run ingest` is optional. Until it finishes, `/chat` answers `503 data_loading`.

Check it works: `curl localhost:3000/health` and `curl localhost:3000/hubs`.

### API

| Endpoint | What it does |
|---|---|
| `GET /health` | `{"status":"ok","data_ready":true}`. `data_ready` is false while the first download runs. |
| `GET /hubs` | The 10 hubs with coordinates and regions |
| `GET /ranking?hazard=&region=` | The ranking the Overview screen shows. Same numbers the agent uses, but no AI call, so it is instant and free. `hazard` is winter, flood, hurricane, heat or wind; leave it out for the overall score. |
| `POST /chat` | Body: `{"message": "...", "conversation_id": "optional"}`. Returns `conversation_id`, the structured `answer`, and `meta` (tools used, corrections, token usage). |
| `GET /conversations/:id` | The saved turns of a conversation, so the UI can restore it after a reload |

```bash
curl -X POST localhost:3000/chat -H "content-type: application/json" \
  -d '{"message":"Which hubs in the Midwest are most exposed to winter disruption?"}'
```

Send the returned `conversation_id` with the next message to ask follow-up questions. Ids are issued by the
server (random UUIDs); an id the server never issued returns 404. Messages in one conversation run one at a time.

Errors always look like `{"error": "...", "code": "..."}`:

| Code | Status | Meaning |
|---|---|---|
| `invalid_request` | 400 | Bad body or id (the message says which field) |
| `not_found` | 404 | Unknown conversation |
| `payload_too_large` | 413 | Body over 10 KB |
| `rate_limited` | 429 | Over 10 chats per minute from this client |
| `daily_limit_reached` | 429 | Over 300 chats today across all clients (protects the credits) |
| `data_loading` | 503 | First data download still running |
| `ai_busy` | 503 | Claude is rate limited, retry shortly |
| `agent_failed` | 502 | The agent could not produce a valid answer |
| `ai_unavailable` | 502 | Claude unreachable or no API key on the server |

Limits: 1000 characters per message, 60 seconds per Claude call (retried once).

Production build: `npm run build` then `npm start`.

## Try the agent from the terminal

Needs `ANTHROPIC_API_KEY` in `backend/.env` and a filled cache (`npm run ingest`).

```bash
cd backend
npm run ask -- "Which Midwest hubs are most exposed to winter disruption?"
```

It prints the structured JSON answer, the tools used, and token counts.

## Run the tests

```bash
cd backend
npm test          # unit tests, no network and no API key needed
npm run typecheck
```

## Run the evals

```bash
cd backend
npm run eval                              # all 12 questions: prints PASS/FAIL per case and a summary
npm run eval -- --verbose                 # also shows every passing check
npm run eval -- --only midwest-winter     # run one or more cases (comma separated ids)
npm run eval -- --repeat 3                # run everything 3 times and report which cases are flaky
```

Cheap runs: put `ANTHROPIC_MODEL=claude-haiku-5-5` in front (about 3 cents per full run instead of about 50 cents).

- The 12 questions and their checks are in `backend/evals/questions.ts`.
- Needs `ANTHROPIC_API_KEY`. It fills an empty data cache by itself.
- Calls real Claude. A full run uses about 150,000 tokens, roughly 60 cents to a dollar on the default model (estimate).
- Full answers are saved to `backend/evals/results/latest.json` (not committed), so a failure can be read without paying for a re-run.
- Exit code is 1 if any case fails, so it can run in CI.
- What it checks: the right tool and arguments, the right hubs in the ranking, numbers backed by tool results, declining
  out-of-scope questions, honest confidence and ties. Expected scores are read from the scoring engine at run time, never hardcoded.
- A check whose precondition no longer holds (e.g. the data stopped showing a tie) is reported as `skip`, not as a pass.
- What it does not check: how well the answer is worded. Results can vary a little between runs; use `--repeat`.

## Deployment (Railway)

Live backend: https://weather-agent-production-5786e20f.up.railway.app (try `/health` and `/hubs`).

Railway builds from the GitHub repo and redeploys on every push to `main`.

| Setting | Value |
|---|---|
| Source | GitHub repo `maayan44/weather-agent`, branch `main` |
| Root Directory | `backend` |
| Build / Start | `npm run build` / `npm start` |
| Healthcheck path | `/health` |
| Region | EU West (Amsterdam) |
| Volume | mounted at `/data` (keeps the SQLite file between deploys) |

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key, set only in Railway |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` (cheap, passes all 12 evals) |
| `DB_PATH` | `/data/weather.db` |
| `FRONTEND_ORIGIN` | the Vercel URL, once the frontend exists (until then any origin is allowed) |

Redeploys: Railway stops the old version with SIGTERM when the new one is ready. The server shuts down cleanly on that signal
(finishes running requests, closes the database, exits 0), so the deploy does not show a "crash". A leftover `npm warn config production`
line in the logs is a harmless deprecation notice from Railway's own setup.

Do not set `NODE_ENV=production`: the build needs the TypeScript compiler, which is a dev dependency.
Do not set `PORT`: Railway provides it.

Checked on the live server: data loads itself on first start, a two-turn chat with follow-up works, and a saved
conversation was still there after a redeploy.

## Run the frontend

The chat app is in `frontend/` (React, Vite, TypeScript, Tailwind CSS and shadcn/ui). It is designed for phones first,
then widens to a two-column layout on a computer.

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_URL: where the backend runs (default http://localhost:3000)
npm run dev               # opens on http://localhost:5173
```

Start the backend too (`cd backend && npm run dev`), so the Overview has data and chat can answer.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with live reload |
| `npm test` | 53 tests: the answer card, composer, API client, error messages and whole-app flows. No network, no AI. |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |

### What the screens show
- **Overview**: all 10 hubs ranked, with each hub's main hazard. An "Ask the agent about any hub…" bar sits at the top (phones), so the AI agent is visible on the first screen; tapping it opens the chat with the keyboard ready. A filter ranks by winter, flood, hurricane, heat or wind. It calls no AI. Tapping a hub asks the agent why.
- **Ask**: the chat. On an empty chat the input is large and central (96 px, with example questions below); once a conversation starts it shrinks to a slim bar at the bottom. Each answer shows the ranking bars, a confidence level in words, and collapsible **Why**, **Assumptions** and **Data gaps and limits** sections, plus a **Copy answer** button. A declined question (another city, a forecast) is shown as a plain notice.
- The conversation is remembered in the browser, so a reload brings it back. **New chat** starts fresh.

### Icon and logo
A white storm cloud with an amber warning bolt on a light blue gradient. `frontend/public/favicon.svg` is the single source;
the PNG sizes (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `favicon-32.png`) are rendered from it, and `site.webmanifest`
makes the app installable ("Add to Home Screen") with this icon. The same file is the logo shown in the app.

### Design rules followed
Apple's interface guidelines: tap targets at least 44 pt, text at least 16 px (so iPhone Safari does not zoom), the system font, a bottom tab bar,
light and dark mode that follow the phone, safe-area padding for the notch, Reduce Motion respected, and confidence never shown by color alone.
Contrast was measured at 4.5:1 or better for text, in both modes.

### Deploy on Vercel
Live app: https://weather-agent-theta-ten.vercel.app

1. In Vercel, create a project from the GitHub repo `maayan44/weather-agent`.
2. Set **Root Directory** to `frontend`. The framework (Vite) is detected automatically.
3. Add the variable `VITE_API_URL` = the Railway address (`https://weather-agent-production-5786e20f.up.railway.app`).
4. After the first deploy, set `FRONTEND_ORIGIN` on Railway to the Vercel address, so only your site can call the API from a browser.
