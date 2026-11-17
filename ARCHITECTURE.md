# Architecture

## 1. System architecture

```
 Chat UI (Vercel)
      |  HTTPS, JSON
      v
 Backend API (Railway, Express)  --- loads/saves conversation --->  SQLite
      |
      v
 Agent (Claude + tools)  --validated JSON answer-->  back to the API
      |  tool calls
      v
 Scoring engine (pure code, no LLM)  <--- reads ---  SQLite  <--- fills ---  Ingestion
                                                                               |
                                                              Open-Meteo (weather)   FEMA NRI (hurricane, flood)
```

| Component | Job |
|---|---|
| Chat UI | Message list, shows ranking and reasons. Talks only to the API. |
| Backend API | Express. `POST /chat` validates the message, loads the last 10 turns, calls the agent, saves the turn, returns JSON. Also `/health`, `/hubs`, `/conversations/:id`. Rate limited because each chat costs money. |
| Startup refresh | On boot the server fills any missing days in the background, then every 6 hours re-downloads the newest 10 days (the archive revises them). One failing hub never blocks the others. If FEMA is down on a fresh server, a bundled FEMA snapshot is used until FEMA answers. `/chat` returns 503 until data is there. |
| Agent | Claude picks a tool, reads its result, writes the explanation. Output must match a JSON schema. |
| Answer check | After Claude answers, our code re-checks it: scores are replaced by the engine's values, duplicates dropped, the order rebuilt per hazard, and "high" confidence lowered when the ranking has a near-tie. A figure no tool returned triggers one retry, then is removed. A number in the text that no tool returned (and is not an exact gap between stated numbers) is flagged to the reader in `data_gaps`. |
| Scoring engine | Formula only. Turns data into 5 sub-scores and one composite (0-100). |
| Data layer | Fetches Open-Meteo + FEMA, caches in SQLite. Scoring never calls the live APIs. |
| Evals | 10 approved questions with checks (`backend/evals/questions.ts`), written before the runner. `npm run eval` runs them on live Claude and checks tool use, hubs, numbers against the engine, declining out-of-scope questions, and honest confidence. Expected numbers are never hardcoded. |

Rule: the LLM never computes or invents a number. Every number comes from a tool result.

Agent tools (all plain functions in our code, inputs validated with Zod):

| Tool | Use |
|---|---|
| `rank_hubs` | Rank all hubs or one region, by composite or one hazard |
| `compare_hubs` | Two hubs side by side, per hazard |
| `get_hub_risk` | One hub's composite, sub-scores and measurements |
| `explain_score` | The measurements that add the most points |
| `get_weather_stats` | "% of days with X" for a period |
| `get_snowfall_total` | Total snowfall and snow days; periods include `last_winter` |

JSON contract (final answer): `in_scope`, `answer`, `ranking[]`, `figures[]`, `reasoning[]`, `assumptions[]`,
`confidence`, `data_gaps[]`. The schema is sent to Claude as `output_config.format` and re-validated with Zod.

`ranking[]` has one entry per hub for each score discussed, ranked within its own hazard (a Miami vs Houston
comparison on hurricane and flood lists each hub twice). Code rebuilds the order from the engine's scores.

The agent keeps only questions and final answers between turns. It calls tools again for follow-ups.

## 2. Repository structure

```
WeatherHub/
  README.md  ARCHITECTURE.md  PLAN.md  TASK.txt  notes.txt
  backend/
    src/
      config/      hubs.ts (10 hubs), scoring.ts (weights, thresholds), dataSources.ts
      data/        Open-Meteo client, FEMA client, SQLite + repositories, ingestion
      scoring/     metrics, sub-scores, composite, ranking
      agent/       tools, JSON schema, system prompt, Claude loop, answer check
      routes/      health, hubs, chat, conversations
      conversations/  saving and loading chat turns
      middleware/  error handler, rate limit
      scripts/     ingest.ts
      app.ts  server.ts
    tests/         unit tests
    evals/         questions.ts (the 10 cases), checks, runner, report
  frontend/        chat UI   (session 2)
```

## 3. Data storage: SQLite

Why SQLite:
- Tiny data: 10 hubs, about 700 days each, plus chats. No server to run.
- One file, easy to demo and to back up.
- It is a rebuildable cache: if the file is lost, `npm run ingest` refills it in about 10 seconds.

| Table | What it holds |
|---|---|
| `daily_weather` | One row per hub per day: snowfall, rain, gusts, max and min temperature |
| `hub_hazards` | Per hub: FEMA hurricane, coastal flood and inland flood frequency |
| `conversation_turns` | One row per question and answer, by conversation id |
| score history | Added only if the alerts bonus is built |

On Railway, attach a volume to keep the file between deploys. Without one, the data is simply re-downloaded.
Postgres would be the next step for many users or hubs. It is not needed here.

## Deployment

| Part | Where | Notes |
|---|---|---|
| Backend + SQLite | Railway, EU West (Amsterdam) | Builds from GitHub `main`. A volume at `/data` holds the database. |
| Frontend | Vercel (session 2) | Calls the backend over HTTPS. CORS is limited by `FRONTEND_ORIGIN`. |
| Secrets | Railway variables | The API key is never in the repo. `.env` is git-ignored. |

On a fresh deploy the server fills an empty database in the background (about 5 seconds). Region choice only affects
the browser-to-server hop; the model call dominates response time.

## 4. Scoring (how risk is decided)

- 5 hazards: winter, flood, hurricane, heat, wind. Each is 0-100.
- Each hazard averages a few metrics. A metric maps a raw value to 0-100 between two fixed anchors.
- Composite = weighted sum. Weights: winter 0.25, flood 0.20, hurricane 0.20, heat 0.20, wind 0.15.
- Hurricane comes only from FEMA. Wind comes only from Open-Meteo gusts. They never overlap.
- All numbers live in `backend/src/config/scoring.ts`. Window: the newest 3 years (1,095 days) of data. Day counts and snowfall are averaged to per-year figures first, so the anchors mean "per year".

## 5. Assumptions, limitations and uncertainty

| Topic | What we assumed | Why it matters |
|---|---|---|
| Hub list | 10 hubs, one point each (metro center). Includes a low-risk control (Los Angeles) | Not the real hub addresses. Results describe the metro area. |
| Weights | winter highest, wind lowest. Judgment call, not measured | Changing them changes the ranking. They are config. |
| Thresholds | Chosen by looking at one year of data for these 10 hubs (per-year anchors) | Fixed anchors, but still a judgment call. |
| Composite | A weighted average hides single extreme hazards | Answers show the dominant hazard next to the composite. |
| Weather source | Open-Meteo archive (a coarse reanalysis model, not stations) | Gust data likely understates extremes (Denver looks calm). |
| Weather window | The newest 3 years (1,095 days) ending today minus 5 days (archive delay) | Covers "last year" and "last winter" even in January. Calendar periods follow today's date; scores are per-year averages over the 3 years. Answers report how many days of a period are missing. |
| Snow day | Snowfall of 0.1 in or more (stats questions); 1 in or more (risk score) | Different questions use different definitions, stated in the answer. |
| "Last winter" | Dec 1 to the end of Feb, the most recent finished winter | Only the newest 3 years are stored, so older winters are not available. |
| FEMA data | County-level, historical event frequency, not a forecast | Same value for the whole county. Used frequency, not FEMA's risk score, because the score is weighted by property value and every large county reads "Very High". A snapshot (2026-11-17) is bundled as a fallback if FEMA is unreachable. |
| Not applicable | FEMA "not applicable" (e.g. hurricanes in Denver) is stored as 0 | Means "no recorded events", not "perfectly safe". |
| Scope | No forecasts, wildfire, earthquake or hubs outside the list | The agent must decline these questions. |
| 3-year average | Scores average the newest 3 years | A big storm every 2 years is seen, but events rarer than 3 years and trends inside the window are not. A day over a threshold counts the same however extreme it was. |
| LLM | Claude Opus 5.5, medium effort. The model name is an env var | Wording can vary between runs. Numbers cannot, because code checks them. |
| Eval coverage | 10 cases; `--repeat` measures flakiness; checks with a stale precondition show as skipped. Checks cover structure and numbers, not wording | Passing does not prove every answer reads well. Keyword checks (e.g. "tie") can miss a correct answer worded differently. |
| Number checks | A figure is accepted if its value appears in any tool result | A made-up figure that happens to equal another number in the results (e.g. a rank of 3) still passes. |
| Access control | No login. Per-client limit (10/min), daily cap across all clients (300 chats), 1000-character messages | Anyone with the URL can chat until the daily cap. Fine for a demo; a real system would add auth. Also set a spend limit in the Claude Console. |
| Conversation ids | Server-issued random UUIDs act as the only secret for reading a conversation | Unguessable, but anyone given the id can read it. Not suitable for private data. |
| Wrong premises | A question like "why is Dallas high?" may not match the data (Dallas ranks 7th of 10) | The agent is told to check the premise and say so. |
