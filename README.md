# Weather Risk Intelligence Agent

A chat agent that helps analysts decide which of 10 US logistics hubs are most exposed to weather disruption.
The risk score comes from a fixed formula in code. The LLM only picks tools and explains their results.

**Live app:** https://weather-agent-theta-ten.vercel.app
(backend: https://weather-agent-production-5786e20f.up.railway.app/health)

Design: [ARCHITECTURE.md](ARCHITECTURE.md).

## Run it locally

Needs Node.js 22+ and an Anthropic API key (the key is only needed for chat, not for scoring or tests).

```bash
# 1. Backend (http://localhost:3000)
cd backend
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY
npm run dev               # downloads weather + FEMA data on first start (~10 s)

# 2. Frontend (http://localhost:5173), in a second terminal
cd frontend
npm install
cp .env.example .env      # VITE_API_URL, default http://localhost:3000
npm run dev
```

Until the first download finishes, chat answers "data is still loading".

Backend settings (`backend/.env`):

| Variable | Meaning | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API key | required for chat |
| `ANTHROPIC_MODEL` | Model the agent uses | `claude-opus-5-5` |
| `DB_PATH` | SQLite file | `./data/weather.db` |
| `FRONTEND_ORIGIN` | Allowed browser origin (CORS) | `*` |

## Tests and evals

```bash
cd backend
npm test                                   # unit tests, no network or API key
npm run eval                               # 12 questions on live Claude, PASS/FAIL per case
npm run eval -- --only midwest-winter      # only some cases (comma-separated ids)
npm run eval -- --repeat 3                 # repeat to find flaky cases
```

`cd frontend && npm test` runs the UI tests.

Evals call real Claude: about 50 cents for a full run on the default model, about 3 cents with
`ANTHROPIC_MODEL=claude-haiku-5-5`. The cases are in `backend/evals/questions.ts`. Expected numbers are
read from the scoring engine at run time, never hardcoded.

Ask from the terminal: `npm run ask -- "Which Midwest hubs are most exposed to winter disruption?"`

## API

| Endpoint | What it does |
|---|---|
| `POST /chat` | `{"message": "...", "conversation_id": "optional"}` returns the structured answer and a `conversation_id` for follow-ups |
| `GET /ranking?hazard=&region=` | The ranking the Overview shows: same engine, no AI call |
| `GET /hubs` | The 10 hubs |
| `GET /conversations/:id` | A saved conversation (restores the chat after a reload) |
| `GET /health` | `data_ready` is false while the first download runs |

Errors are `{"error": "...", "code": "..."}`. Limits: 10 chats per minute per client, 300 per day in total,
1000 characters per message.

## Deployment

| Part | Where | Settings |
|---|---|---|
| Backend | Railway, from GitHub `main` | Root `backend`, volume at `/data`, `DB_PATH=/data/weather.db`, `ANTHROPIC_MODEL=claude-haiku-5-5`, `FRONTEND_ORIGIN` = the Vercel URL |
| Frontend | Vercel, from GitHub `main` | Root `frontend`, `VITE_API_URL` = the Railway URL |

Don't set `NODE_ENV=production` on Railway: the build needs dev dependencies.
