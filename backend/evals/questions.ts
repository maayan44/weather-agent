import { HUB_IDS } from "../src/config/hubs";
import type { Hazard } from "../src/config/scoring";

// The eval spec, written BEFORE the runner (step 7) so it describes what the agent must do,
// not what it happens to do. Expected numbers are never hardcoded: the runner asks the scoring
// engine at run time, so the set keeps working as the 12-month window moves.

type AnswerField = "answer" | "assumptions" | "data_gaps" | "anywhere";

export type Check =
  // The agent used this tool. `input` lists only the arguments that must match.
  | { kind: "calls_tool"; tool: string; input?: Record<string, string> }
  | { kind: "in_scope"; value: boolean }
  // Same set of hubs; the order is already forced to the engine's order by the answer check.
  | { kind: "ranking_hubs"; hubs: string[] }
  | { kind: "empty"; field: "ranking" | "figures" }
  // No number was removed for lacking a tool result.
  | { kind: "all_figures_grounded" }
  // The engine's real score for this hub appears in the answer's ranking or figures.
  | { kind: "quotes_engine_score"; hub: string; metric: Hazard | "composite" }
  | { kind: "mentions"; anyOf: string[]; in: AnswerField }
  | { kind: "confidence"; is?: "high" | "medium" | "low"; not?: "high" | "medium" | "low" }
  // If the engine says the two hubs are within `withinPoints`, the answer must say it is a tie or close.
  | { kind: "tie_acknowledged"; hubs: [string, string]; metric: Hazard | "composite"; withinPoints: number };

export interface EvalTurn {
  ask: string;
  checks: Check[];
}

export interface EvalCase {
  id: string;
  title: string;
  source: "task example" | "follow-up" | "out of scope" | "near-tie" | "composite" | "tool gap";
  // More than one turn tests follow-up questions; history is carried between turns.
  turns: EvalTurn[];
}

const MIDWEST_WINTER = "Which hubs in the Midwest are most exposed to winter disruption?";

export const EVAL_CASES: EvalCase[] = [
  {
    id: "midwest-winter",
    title: "Rank Midwest hubs by winter exposure",
    source: "task example",
    turns: [
      {
        ask: MIDWEST_WINTER,
        checks: [
          { kind: "calls_tool", tool: "rank_hubs", input: { region: "Midwest", hazard: "winter" } },
          { kind: "ranking_hubs", hubs: ["chicago", "minneapolis", "detroit"] },
          { kind: "all_figures_grounded" },
        ],
      },
    ],
  },
  {
    id: "miami-vs-houston",
    title: "Compare Miami and Houston on hurricane and flood",
    source: "task example",
    turns: [
      {
        ask: "Compare Miami and Houston in terms of hurricane and flood exposure.",
        checks: [
          { kind: "calls_tool", tool: "compare_hubs" },
          { kind: "ranking_hubs", hubs: ["miami", "houston"] },
          { kind: "mentions", anyOf: ["county"], in: "data_gaps" },
          { kind: "all_figures_grounded" },
        ],
      },
    ],
  },
  {
    id: "denver-snow-days",
    title: "Percentage of snow days in Denver last year",
    source: "task example",
    turns: [
      {
        ask: "What percentage of days in Denver last year had snowfall?",
        checks: [
          { kind: "calls_tool", tool: "get_weather_stats", input: { hub: "denver", condition: "snowfall", period: "last_calendar_year" } },
          { kind: "mentions", anyOf: ["0.1"], in: "assumptions" },
          { kind: "all_figures_grounded" },
        ],
      },
    ],
  },
  {
    id: "dallas-false-premise",
    title: "Dallas is not actually high risk: challenge the premise",
    source: "task example",
    turns: [
      {
        ask: "Why is the Dallas hub's weather disruption risk high?",
        checks: [
          { kind: "calls_tool", tool: "explain_score", input: { hub: "dallas" } },
          { kind: "quotes_engine_score", hub: "dallas", metric: "composite" },
          { kind: "mentions", anyOf: ["rank", "moderate", "middle", "lower", "not high", "below"], in: "answer" },
        ],
      },
    ],
  },
  {
    id: "follow-up-flood",
    title: "Follow-up keeps the Midwest and switches to flood",
    source: "follow-up",
    turns: [
      { ask: MIDWEST_WINTER, checks: [{ kind: "calls_tool", tool: "rank_hubs" }] },
      {
        ask: "What if I only look at flood risk?",
        checks: [
          { kind: "calls_tool", tool: "rank_hubs", input: { region: "Midwest", hazard: "flood" } },
          { kind: "ranking_hubs", hubs: ["chicago", "minneapolis", "detroit"] },
        ],
      },
    ],
  },
  {
    id: "unknown-city",
    title: "Seattle is not one of our hubs",
    source: "out of scope",
    turns: [
      {
        ask: "What's the weather risk for our Seattle hub?",
        checks: [
          { kind: "in_scope", value: false },
          { kind: "empty", field: "ranking" },
          { kind: "empty", field: "figures" },
        ],
      },
    ],
  },
  {
    id: "forecast-request",
    title: "No forecasts: decline a next-week hurricane question",
    source: "out of scope",
    turns: [
      {
        ask: "Will a hurricane hit Miami next week?",
        checks: [
          { kind: "in_scope", value: false },
          { kind: "mentions", anyOf: ["forecast"], in: "answer" },
          { kind: "empty", field: "figures" },
        ],
      },
    ],
  },
  {
    id: "detroit-chicago-tie",
    title: "Detroit and Chicago are a near-tie on winter",
    source: "near-tie",
    turns: [
      {
        ask: "Is Detroit or Chicago more exposed to winter?",
        checks: [
          { kind: "calls_tool", tool: "compare_hubs" },
          { kind: "tie_acknowledged", hubs: ["detroit", "chicago"], metric: "winter", withinPoints: 3 },
          { kind: "confidence", not: "high" },
        ],
      },
    ],
  },
  {
    id: "overall-priority",
    title: "Overall investment priority across all hubs",
    source: "composite",
    turns: [
      {
        ask: "Which hubs should we prioritize for resilience investment overall?",
        checks: [
          { kind: "calls_tool", tool: "rank_hubs" },
          { kind: "ranking_hubs", hubs: [...HUB_IDS] },
          { kind: "confidence", is: "medium" },
          { kind: "all_figures_grounded" },
        ],
      },
    ],
  },
  {
    id: "chicago-last-winter-snow",
    title: "Total snowfall in Chicago last winter",
    source: "tool gap",
    turns: [
      {
        ask: "How many inches of snow fell in Chicago last winter?",
        checks: [
          { kind: "calls_tool", tool: "get_snowfall_total", input: { hub: "chicago", period: "last_winter" } },
          { kind: "mentions", anyOf: ["winter"], in: "assumptions" },
          { kind: "all_figures_grounded" },
        ],
      },
    ],
  },
];
