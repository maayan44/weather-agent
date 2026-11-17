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
| Startup refresh | On boot the server fills any missing data in the background and refreshes it every 6 hours. `/chat` returns 503 until the data is there. |
| Agent | Claude picks a tool, reads its result, writes the explanation. Output must match a JSON schema. |
| Answer check | After Claude answers, our code re-checks it: scores are replaced by the engine's values, the order is rebuilt, and numbers no tool returned trigger one retry, then are removed. |
| Scoring engine | Formula only. Turns data into 5 sub-scores and one composite (0-100). |
| Data layer | Fetches Open-Meteo + FEMA, caches in SQLite. Scoring never calls the live APIs. |
| Evals | 10 approved questions with checks (`backend/evals/questions.ts`), written before the runner. The runner (step 7) checks tool use, numbers against the engine, and declining out-of-scope questions. Expected numbers are never hardcoded. |

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
    evals/         questions.ts (the spec), runner in step 7
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

## 4. Scoring (how risk is decided)

- 5 hazards: winter, flood, hurricane, heat, wind. Each is 0-100.
- Each hazard averages a few metrics. A metric maps a raw value to 0-100 between two fixed anchors.
- Composite = weighted sum. Weights: winter 0.25, flood 0.20, hurricane 0.20, heat 0.20, wind 0.15.
- Hurricane comes only from FEMA. Wind comes only from Open-Meteo gusts. They never overlap.
- All numbers live in `backend/src/config/scoring.ts`. Window: the newest 365 days of data.

## 5. Assumptions, limitations and uncertainty

| Topic | What we assumed | Why it matters |
|---|---|---|
| Hub list | 10 hubs, one point each (metro center). Includes a low-risk control (Los Angeles) | Not the real hub addresses. Results describe the metro area. |
| Weights | winter highest, wind lowest. Judgment call, not measured | Changing them changes the ranking. They are config. |
| Thresholds | Chosen by looking at the last year of data for these 10 hubs | Fixed anchors, but still a judgment call. |
| Composite | A weighted average hides single extreme hazards | Answers show the dominant hazard next to the composite. |
| Weather source | Open-Meteo archive (a coarse reanalysis model, not stations) | Gust data likely understates extremes (Denver looks calm). |
| Weather window | Jan 1 of last year to today minus 5 days (archive delay) | "Last year" = last calendar year. Scores use the newest 365 days. |
| Snow day | Snowfall of 0.1 in or more (stats questions); 1 in or more (risk score) | Different questions use different definitions, stated in the answer. |
| "Last winter" | Dec 1 to the end of Feb, the most recent finished winter | Data starts Jan 1 of last year, so older winters are not available. |
| FEMA data | County-level, historical event frequency, not a forecast | Same value for the whole county. Used frequency, not FEMA's risk score, because the score is weighted by property value and every large county reads "Very High". |
| Not applicable | FEMA "not applicable" (e.g. hurricanes in Denver) is stored as 0 | Means "no recorded events", not "perfectly safe". |
| Scope | No forecasts, wildfire, earthquake or hubs outside the list | The agent must decline these questions. |
| Single year | Scores reflect one 12-month window | One unusual year (e.g. dry Denver winter) can distort a score. |
| LLM | Claude Opus 5.5, medium effort. The model name is an env var | Wording can vary between runs. Numbers cannot, because code checks them. |
| Access control | No login. The only protection is a per-client rate limit and a message length limit | Anyone with the URL can chat and spend credits. Fine for a demo. A real system would add auth and a spend cap. |
| Conversation ids | Random ids act as the only secret for reading a conversation | Fine for a demo. Not suitable for private data. |
| Wrong premises | A question like "why is Dallas high?" may not match the data (Dallas ranks 7th of 10) | The agent is told to check the premise and say so. |
