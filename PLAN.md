# Weather Risk Intelligence Agent - Plan

Owner/decision maker: Maayan. Claude proposes, Maayan decides.
Constraint: 2 working sessions max. No code until the plan is approved.
TASK.txt and README.txt are read-only. Do not edit them.

## 1. Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Language | TypeScript (Node) |
| 2 | LLM | Claude via the Anthropic SDK, tool use + structured output |
| 3 | Scoring | Deterministic formula in code. The LLM never computes or invents numbers. |
| 4 | Hubs | 10 US hubs, coordinates and region in a config file |
| 5 | Weather data | Open-Meteo (historical archive, last 12 months to today): snowfall, precipitation, wind speed/gusts, temperature |
| 6 | Hurricane + flood data | FEMA National Risk Index (county-level ratings) |
| 6b | FEMA fields used | Annualized **frequency** (HRCN/CFLD/IFLD_AFREQ), not FEMA risk scores. Verified live: scores are property-value weighted, so big counties all read "Very High" and hubs can't be told apart. Nulls = not applicable = 0. Inland flood is `IFLD` in this NRI version. |
| 6c | Weather window | Jan 1 of last year to today minus 5 days (archive lag), local time, US units. Covers both "last year" and "last 12 months". |
| 7 | Storage | SQLite: weather cache, hub scores history, conversations |
| 8 | Deploy | Backend on Railway (Render is the fallback), frontend on Vercel |
| 9 | Voice | Bonus only, last priority |

Deploy is final: Railway (Maayan already has an account). Weights approved as a starting point.

Hubs (final, 10): Chicago, Minneapolis, Detroit (Midwest), Denver (Mountain), Dallas (South Central), Houston (Gulf Coast), Miami (Southeast coast), Atlanta (Southeast), Phoenix (Southwest, heat case), Los Angeles (West Coast, control).

Code conventions (from README):
- No duplicated code: write a function once and reuse it.
- Short comments: explain why, not what, 1-2 lines max.
- Clear variable names.
- Small files with one job (routes, agent, scoring, data fetching).

Open items:
- Exact thresholds for each sub-score (set at the start of session 1).

## 2. Architecture

```
Chat UI (Vercel)
   -> Backend API (Railway)   POST /chat, GET /hubs, GET /ranking
        -> Agent (Claude + tools, validated JSON output)
             -> Scoring Engine (pure functions, no LLM)
             -> Data layer (SQLite)
                   ^
        Ingestion (Open-Meteo client, FEMA NRI loader)  - scheduled or on startup
```

Rules:
- The scoring engine reads only from SQLite, never from live APIs, so results are reproducible.
- The agent only sees tool results. Every number in an answer must come from a tool.
- SQLite is a rebuildable cache: the DB can be re-seeded on startup. This makes host changes cheap.
- Output contract (JSON schema): `{answer, ranking[], sub_scores, assumptions[], confidence, data_gaps[]}`, validated before it reaches the UI.

## 3. Scoring design (proposal, to be approved)

Five sub-scores, each 0-100, using fixed thresholds (not relative to other hubs):

| Sub-score | Source | Metric (examples) |
|---|---|---|
| Winter | Open-Meteo | snow days, heavy-snow days, extreme-cold days |
| Wind | Open-Meteo | days with gusts above a threshold (non-hurricane, general wind) |
| Heat | Open-Meteo | days above a high-temperature threshold, heat-wave streaks |
| Flood | FEMA NRI (+ Open-Meteo heavy-rain days as a minor input) | riverine/coastal flood rating |
| Hurricane | FEMA NRI only | hurricane rating, applies mainly to coastal/Gulf hubs |

No overlap: hurricane comes only from FEMA and wind only from Open-Meteo gusts. Wind and hurricane are never double-counted.

Composite = weighted sum, with weights in the config file. Starting point: winter 0.25, flood 0.20, hurricane 0.20, wind 0.15, heat 0.20 (to be tuned). The output always includes the sub-scores, so "why is X high?" is answered from the data.

Hubs where a hazard does not apply (for example hurricane in Denver) get a defined value (0 or excluded), documented as an assumption.

## 4. Agent tools (proposal)

- `get_hub_risk(hub)` - composite plus sub-scores
- `rank_hubs(region?, hazard?)`
- `compare_hubs(a, b, hazards?)`
- `get_weather_stats(hub, condition, period)` - for questions like "% of days with snow in Denver last year"
- `get_snowfall_total(hub, period)` - total inches and snow days; periods include `last_winter` (Dec 1 - end of Feb)
- `explain_score(hub)` - top contributing factors

Out-of-scope questions (non-hub cities, forecasts, etc.) are declined and stated as such.

## 5. Session 1 - Backend, scoring, agent, evals

Order changed during the work (agreed with Maayan):
- Eval questions are written BEFORE the runner, as a spec (`backend/evals/questions.ts`, 10 approved cases).
- A live Claude call comes right after the agent, because it was the biggest unknown.
- The backend is deployed as a skeleton right after the API, so deploy problems show up early.
- The server fills an empty database on startup, so a fresh deploy works.

| # | Step | State |
|---|---|---|
| 1 | Finish the plan | Done |
| 2 | Scaffold + hubs config | Done |
| 3 | Data layer: Open-Meteo, FEMA, SQLite cache | Done |
| 4 | Scoring engine + unit tests | Done |
| 5 | Agent: 6 tools, JSON schema, answer check (tested with a scripted model) | Done |
| 5a | Eval questions (spec only) | Done |
| 5b | First live Claude call (`npm run ask`) | Done: schema accepted, right tool, correct ranking, no corrections needed |
| 6 | API endpoint + conversation history + ingest on startup | Done, checked live (fresh DB, 2-turn chat, reload) |
| 6a | Deploy backend skeleton to Railway (with a volume) | Done: live, chat + follow-up checked, data survives a redeploy |
| 7 | Eval runner: one command, pass/fail | Done: 10/10 cases, 32/32 checks on live Claude |
| 7a | Code review + fix all 20 findings | Done: 174 tests, eval 10/10 on Haiku (also 20/20 over 2 repeats). Not yet deployed to Railway (needs a push) |

Done when: `npm run eval` prints pass/fail and a curl to `/chat` returns a valid structured answer.

## 6. Session 2 - UI, deploy, polish

1. Chat UI: input, message list, ranking and reasons shown
2. Deploy: frontend on Vercel, connect it to the Railway backend deployed in session 1
3. Bonus if time allows: voice first, then alerts (scheduled rescoring that diffs against the last stored score)
4. Final check: tests, bugs, refactors, issues, edge cases
5. Export the full AI session transcript (mandatory deliverable) and add it to the repo

## 7. Deliverables checklist (from TASK.txt)

- [ ] Source code + run instructions
- [ ] Live-runnable agent (URL preferred)
- [ ] Design doc: architecture, repo structure, data storage choice
- [ ] Full AI session transcript (mandatory)
- [ ] Deterministic scoring, chat UI, API used by the UI
- [ ] JSON schema between LLM and code
- [ ] Eval set + runner
- [ ] Assumptions, uncertainty and scope stated clearly
- [ ] Bonus: alerts, voice

## 8. Risks

- FEMA NRI is county-level, so it is coarse for a single hub. State this as an uncertainty.
- Weights are judgment calls. They are config and shown to the user.
- Free hosting limits (sleep, ephemeral disk). Mitigated by the re-seedable DB.
- Verify the Open-Meteo and FEMA endpoints and data formats at the start of session 1.
