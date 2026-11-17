# Architecture

## 1. System architecture

```
 Chat UI (React, Vercel)
      |  HTTPS + JSON
      v
 Backend API (Express, Railway) ------ conversations ------> SQLite
      |
      v
 Agent (Claude + 6 tools) ---- validated JSON answer ----> API -> UI
      |  tool calls
      v
 Scoring engine (pure code, no LLM) <--- reads --- SQLite <--- fills --- Ingestion
                                                                          |
                                                    Open-Meteo (weather)  +  FEMA NRI (hurricane, flood)
```

| Component | Job |
|---|---|
| Chat UI | Chat first (one question at a time), plus an Overview ranking. Each answer shows the tools it used and the source of each number. Talks only to the API. |
| Backend API | `POST /chat` loads the conversation, runs the agent, saves the turn. `GET /ranking` serves the Overview without an AI call. |
| Agent | Claude chooses tools and explains their results. Its final answer must match a JSON schema. |
| Answer check | Code checks the answer before it is sent: scores are replaced by the engine's values, numbers no tool returned trigger one retry and are then removed, false rank claims are corrected, and each number gets its source and period from the tool result that holds it. |
| Scoring engine | A fixed formula: 5 hazard scores (winter, flood, hurricane, heat, wind) and one weighted composite, each 0-100. |
| Ingestion | Downloads weather and FEMA data into SQLite on startup, then refreshes regularly. Scoring never calls a live API. |
| Evals | 12 questions with checks, run on live Claude with `npm run eval`. |

**Core rule:** the LLM never computes or invents a number. Every number comes from a tool, and code checks this.

**Agent tools:** `rank_hubs`, `compare_hubs`, `get_hub_risk`, `explain_score`, `get_weather_stats` (% of days with X),
`get_snowfall_total`.

**JSON answer:** `in_scope`, `answer`, `ranking[]`, `figures[]`, `reasoning[]`, `assumptions[]`, `confidence`,
`data_gaps[]`. The schema is sent to Claude as the required output format and validated again with Zod.

**Scoring:** the newest 3 years of weather. Day counts (snow days, days of 95°F or more, gust days...) are averaged
per year and placed on a 0-100 scale between fixed thresholds. Weights: winter 0.25, flood 0.20, hurricane 0.20,
heat 0.20, wind 0.15. All numbers are in `backend/src/config/scoring.ts`.

## 2. Repository structure

```
backend/
  src/
    config/         hubs, scoring weights and thresholds, data sources, agent settings
    data/           Open-Meteo and FEMA clients, SQLite, ingestion
    scoring/        the formula: metrics, hazard scores, composite, ranking
    agent/          tools, JSON schema, prompt, Claude loop, answer checks
    routes/         chat, ranking, hubs, conversations, health
    conversations/  saving and loading chat turns
    middleware/     errors, rate limits
  tests/            unit tests (no network)
  evals/            eval questions, checks, runner
frontend/
  src/              React app: components, hooks, API client
```

## 3. Data storage: SQLite

- **Small data:** 10 hubs × 1,095 days, plus chats, is about 1 MB. It needs no database server.
- **One file:** easy to run locally and to keep on a Railway volume.
- **Rebuildable cache:** if the file is lost, the server downloads everything again in about 10 seconds.

| Table | Holds |
|---|---|
| `daily_weather` | One row per hub per day: snowfall, rain, max gust, max and min temperature |
| `hub_hazards` | Per hub: FEMA hurricane, coastal flood and inland flood frequency |
| `conversation_turns` | Each question, answer and the tools used, by conversation id |

Postgres would be the next step for many users or many hubs. It isn't needed here.

## 4. Assumptions and limits

| Topic | Assumption | Effect |
|---|---|---|
| Hubs | 10 metro-center points, not real hub addresses | Results describe the metro area |
| Weights and thresholds | Our judgment, not measured | Changing them changes the ranking. They are config. |
| Weather | Open-Meteo archive, a coarse model rather than stations | Gusts likely understate extremes |
| Window | Newest 3 years, averaged per year over the days available | Events rarer than 3 years are not seen. A day over a threshold counts the same however extreme it was. Missing data is flagged, including a season with many missing days. |
| FEMA | County-level historical frequency, not a forecast. "Not applicable" is stored as 0 | Same value for the whole county |
| Composite | A weighted average can hide one extreme hazard | Answers name the dominant hazard and flag high single hazards |
| Scope | No forecasts, other hazards or other cities | The agent declines these |
| Access | No login. Rate limits and a daily cap protect the API credits | Fine for a demo, not for private data |
