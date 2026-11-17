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
| Eval runner (`npm run eval`) | Done: 10/10 cases pass on live Claude |
| Chat UI, frontend deploy | Session 2 |

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
npm run eval                              # all 10 questions: prints PASS/FAIL per case and a summary
npm run eval -- --verbose                 # also shows every passing check
npm run eval -- --only midwest-winter     # run one or more cases (comma separated ids)
npm run eval -- --repeat 3                # run everything 3 times and report which cases are flaky
```

Cheap runs: put `ANTHROPIC_MODEL=claude-haiku-5-5` in front (about 3 cents per full run instead of about 50 cents).

- The 10 questions and their checks are in `backend/evals/questions.ts`.
- Needs `ANTHROPIC_API_KEY`. It fills an empty data cache by itself.
- Calls real Claude. A full run uses about 120,000 tokens, roughly 50 cents to a dollar on the default model (estimate).
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
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` (cheap, passes all 10 evals) |
| `DB_PATH` | `/data/weather.db` |
| `FRONTEND_ORIGIN` | the Vercel URL, once the frontend exists (until then any origin is allowed) |

Do not set `NODE_ENV=production`: the build needs the TypeScript compiler, which is a dev dependency.
Do not set `PORT`: Railway provides it.

Checked on the live server: data loads itself on first start, a two-turn chat with follow-up works, and a saved
conversation was still there after a redeploy.

## Run the frontend

Coming in session 2.
