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
| 5 | Weather data | Open-Meteo (historical archive, newest 3 years): snowfall, precipitation, wind speed/gusts, temperature |
| 6 | Hurricane + flood data | FEMA National Risk Index (county-level ratings) |
| 6b | FEMA fields used | Annualized **frequency** (HRCN/CFLD/IFLD_AFREQ), not FEMA risk scores. Verified live: scores are property-value weighted, so big counties all read "Very High" and hubs can't be told apart. Nulls = not applicable = 0. Inland flood is `IFLD` in this NRI version. |
| 6c | Weather window | The newest 3 years (1,095 days) ending today minus 5 days (archive lag), local time, US units, one request per hub. Scores are per-year averages over this window; it also covers "last year", "last 12 months" and "last winter". Chosen because one year is noisy: a hub with a big storm every 2nd year would swing between high and low. |
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

1. Chat UI: input, message list, ranking and reasons shown. DONE locally: mobile-first React + Vite + Tailwind + shadcn/ui,
   Overview screen (needed the new `GET /ranking` endpoint), answer cards with confidence/assumptions/data gaps, copy button.
   Apple guidelines (44 pt targets, 16 px text, safe areas, dark mode) checked by measurement in a 430x932 frame; 53 frontend tests.
   Not yet seen on a real iPhone or in screenshots (Chrome screenshots timed out): the user will test on the phone.
1b. Fixes from the user's first real phone prompt ("summarize the past half year of weather in Chicago..."), all 5 done:
   (1) new stats periods last_6_months / last_3_months / last_30_days (it had silently used year-to-date, 10.5 months, which hides winter);
   (2) prompt: a period under a year misses seasons, say so and give the 12-month score; (3) one hub = overall + 5 hazards, shown as ONE profile card;
   (4) no repeated scores in Key numbers (prompt + code drop), at most 6 figures; (5) say when the city is already one of our 10 hubs and that
   new-site decisions need cost/demand/access data. Evals now 12 (2 new, from this prompt): 12/12 pass on Haiku. 192 backend + 60 frontend tests.
1c. UI feedback round (user): (a) app icon/logo/favicon (storm cloud + warning bolt, blue) with iPhone home-screen icon and manifest;
   (b) the input was too small/hidden: large 96 px input on an empty chat that shrinks to a slim bar once chatting (A), plus an
   "Ask the agent about any hub..." bar at the top of the Overview that opens the chat with the keyboard ready (B).
   Measured at 430x932, 375x667 and 1280x800; 70 frontend tests. Uncommitted.
1d. Fixes from the second live answer (Chicago half year): (1) hub tools now return the hub's rank among the 10 (overall and per hazard,
   ties share a rank) and the agent states it; (2) the existing-hub note goes in the first sentence; (3) at most 6 figures, enforced in code;
   (4) "1 days" -> "1 day" in the app and copied text; (5) one rounding rule for measurements (24.5 everywhere).
   Found while verifying: the answer paragraph called a winter-less half year "little weather stress" with the warning only in collapsed
   sections, so code now appends the partial-period warning when a period under a year was used and the paragraph lacks it, and the eval
   checks the visible paragraph ("summary"), not the bullets. Also: graceful SIGTERM shutdown (Railway's "crash" on redeploy was the old
   container being stopped). 216 backend + 73 frontend tests; evals 12/12 on Haiku. Uncommitted.
1e. Hub profile completed by code (user: show the extra risk in a specific hub even when the overall score is moderate): the engine fills in
   all six scores and each hub rank ("1st of 10 hubs"); the card labels hazards High/Moderate/Low (bands 50 / 25) and says when the overall
   score understates a high hazard. 226 backend + 88 frontend tests; evals 12/12 on Haiku. Uncommitted.
1f. No false claims (user: "no false information in any answers"): found in a live answer ("winter, its third-ranked hazard" when it is second). New `claimVerifier.ts` checks ranking/order statements in the answer, reasoning, assumptions and data gaps against the engine; a wrong one goes back to the model once, then the code rewrites it with the true fact (or drops the sentence). Prompt rule added (hub rank vs order of one hub's hazards; include the 12-month figures when a short period is used). New eval check `no_false_claims` on the 3 profile-style cases. 257 backend tests; evals on Haiku 9/9 over 3 repeats. Limit: only phrasings it can read with confidence are checked.
1g. 3-year scoring window (user: a rare big storm every ~2 years should not make a score swing): the cache now holds 3 years (checked live: one Open-Meteo request per hub, 10 hubs in about 6 s, DB about 1.1 MB). Day counts and snowfall are averaged to per-year figures over the days actually available (units "days/yr", "in/yr"), so the 0-100 anchors are unchanged. Prompt, data-gap text, partial-period note and Overview text say "3-year average". Limit: events rarer than 3 years, and trends inside the window, are not captured; one day over a threshold counts the same however extreme. 259 backend + 88 frontend tests. Evals NOT yet re-run (costs API). Committed (b5225ba). README and ARCHITECTURE then cut to the deliverable points only. Evals on Haiku after the change: 4/4 cases (midwest-winter, dallas-false-premise, half-year-new-hub, chicago-profile), 18/18 checks. Found there: the number check flagged the date "13 May" as an unverified number; fixed (day-first dates are skipped). Existing deploys backfill the extra years automatically on the next startup.

### Next planned (agreed with Maayan)
- Send guard: DONE. One question at a time (a ref, so a fast double tap cannot slip through); Q1, A1, Q2, A2 order tested. Found while testing: a retry showed the question twice; fixed.
- Each hub's hazards ordered per hub: already the case (the profile card sorts a hub's hazards by score, highest first). Sorting by points (score x weight) was offered; Maayan chose to keep the score order, so bars read in falling order and match the text.
- Source and period on each figure: DONE. Tool results carry source + data_period next to their numbers (engine scores, FEMA frequencies, Open-Meteo counts, stats dates); code copies them onto each figure from the result that holds the value, using the unit when a number appears twice, and leaves the label off when it still cannot tell. The model's output format is unchanged. On the real Chicago/Dallas eval answers every figure got the right label.
- Small UI polish: DONE: "Used: rank hubs, explain score" under each answer (tool names now saved with each turn, so they survive a reload; older databases get the new column automatically); Ask is the default tab; minimal empty chat (user: like the Claude web app): header "WeatherHub" + slogan, one greeting with the icon on its left, the input centered, 2 example questions; the extra explanation lines removed.
- Skipped for now: the closed Overview sidebar (Overview stays pinned on wide screens).

2. Deploy: frontend on Vercel, connect it to the Railway backend deployed in session 1. DONE: https://weather-agent-theta-ten.vercel.app
   (checked in a real browser: 10 hubs load from Railway, no console errors). FRONTEND_ORIGIN on Railway is set to this address (checked live: other origins are not allowed).
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
