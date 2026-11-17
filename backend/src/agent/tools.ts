import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { HUBS, requireHub } from "../config/hubs";
import { HAZARDS } from "../config/scoring";
import { toIsoDate } from "../data/dateRange";
import type { Db } from "../data/db";
import { getDailyWeather, getLatestWeatherDate } from "../data/weatherRepository";
import { explainHubRisk } from "../scoring/explain";
import { computeHubRanks } from "../scoring/hubRanks";
import { getAllHubRisks, getHubRisk } from "../scoring/hubRiskService";
import { buildRankingView } from "../scoring/rankingView";
import type { HubRisk } from "../scoring/types";
import { computePercentOfDays, computeSnowfallTotal, resolvePeriod, type StatsPeriod } from "../scoring/weatherStats";
import { compareHubsInput, explainScoreInput, getHubRiskInput, getSnowfallTotalInput, getWeatherStatsInput, rankHubsInput } from "./schemas";

export interface ToolContext {
  db: Db;
  // The date questions like "last year" are relative to. Fixed in tests so results never depend on the clock.
  today?: Date;
}

interface AgentTool<Schema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: Schema;
  run: (input: z.infer<Schema>, context: ToolContext) => unknown;
}

// Keeps each tool's input typed from its schema while letting them share one list.
function defineTool<Schema extends z.ZodType>(tool: AgentTool<Schema>): AgentTool {
  return tool as unknown as AgentTool;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// One rounding rule for every measurement, so the same snowfall never shows as 24.5 in one tool and 24.48 in another.
// Yearly event frequencies are small numbers where the second decimal matters (0.18 hurricanes a year).
function roundMeasurement(value: number, unit: string): number {
  return round(value, unit === "events/yr" ? 2 : 1);
}

// Where the hub stands among all the hubs: the comparison an analyst needs when deciding where to invest.
function loadHubRanks(db: Db, hubId: string) {
  const ranks = computeHubRanks(hubId, getAllHubRisks(db, HUBS));
  return { out_of: ranks.out_of, overall: ranks.composite, ...ranks.hazards };
}

// Shared by the stats tools.
function loadPeriodWeather({ db, today = new Date() }: ToolContext, hubId: string, period: StatsPeriod) {
  const hub = requireHub(hubId);
  const latestDate = getLatestWeatherDate(db, hub.id);
  if (!latestDate) throw new Error(`No cached weather for ${hub.name}`);
  const span = resolvePeriod(period, toIsoDate(today), latestDate);
  return { hubName: hub.name, span, weather: getDailyWeather(db, hub.id, span.startDate, span.endDate) };
}

// A compact view of a score: enough to explain it, small enough to keep the model focused.
function toHubRiskView(risk: HubRisk, rankAmongHubs: ReturnType<typeof loadHubRanks>) {
  return {
    hub_id: risk.hubId,
    hub: risk.hubName,
    region: risk.region,
    composite_score: risk.compositeScore,
    dominant_hazard: risk.dominantHazard,
    // 1 = most exposed of the hubs; equal scores share a rank.
    rank_among_hubs: rankAmongHubs,
    sub_scores: Object.fromEntries(
      HAZARDS.map((hazard) => {
        const subScore = risk.subScores[hazard];
        return [
          hazard,
          {
            score: subScore.score,
            weight: subScore.weight,
            metrics: subScore.metrics.map((metric) => ({
              name: metric.label,
              value: roundMeasurement(metric.rawValue, metric.unit),
              unit: metric.unit,
              score: metric.score,
            })),
          },
        ];
      }),
    ),
    data_window: `${risk.windowStart} to ${risk.windowEnd}`,
    days_of_data: risk.daysOfData,
    data_gaps: risk.dataGaps,
  };
}

export const AGENT_TOOLS: AgentTool[] = [
  defineTool({
    name: "get_hub_risk",
    description:
      "Get one hub's weather-disruption risk: composite score (0-100), the five hazard sub-scores (winter, flood, hurricane, heat, wind), the measurements behind each, and where the hub ranks among all the hubs (overall and per hazard).",
    inputSchema: getHubRiskInput,
    run: ({ hub }, { db }) => toHubRiskView(getHubRisk(db, requireHub(hub)), loadHubRanks(db, hub)),
  }),

  defineTool({
    name: "rank_hubs",
    description:
      "Rank hubs from highest to lowest risk. Optionally limit to one region and/or rank by one hazard (for example winter in the Midwest). Use this for 'which hubs are most exposed' questions.",
    inputSchema: rankHubsInput,
    run: ({ region, hazard }, { db }) => buildRankingView(db, region, hazard),
  }),

  defineTool({
    name: "compare_hubs",
    description:
      "Compare two hubs side by side on every hazard, with the difference per hazard. Use for 'compare X and Y' questions.",
    inputSchema: compareHubsInput,
    run: ({ hub_a, hub_b }, { db }) => {
      if (hub_a === hub_b) throw new Error("Pick two different hubs to compare");
      const riskA = getHubRisk(db, requireHub(hub_a));
      const riskB = getHubRisk(db, requireHub(hub_b));
      return {
        hub_a: toHubRiskView(riskA, loadHubRanks(db, hub_a)),
        hub_b: toHubRiskView(riskB, loadHubRanks(db, hub_b)),
        per_hazard: HAZARDS.map((hazard) => ({
          hazard,
          [riskA.hubId]: riskA.subScores[hazard].score,
          [riskB.hubId]: riskB.subScores[hazard].score,
          higher_risk: riskA.subScores[hazard].score === riskB.subScores[hazard].score
            ? "equal"
            : riskA.subScores[hazard].score > riskB.subScores[hazard].score ? riskA.hubName : riskB.hubName,
        })),
      };
    },
  }),

  defineTool({
    name: "get_weather_stats",
    description:
      "Count how many days at one hub had a given condition (snow, rain, heat, strong gusts...) in a period, as a number of days and a percentage. Use for 'what percentage of days...' questions. The response includes the exact definition of the condition.",
    inputSchema: getWeatherStatsInput,
    run: ({ hub, condition, period }, context) => {
      const { hubName, span, weather } = loadPeriodWeather(context, hub, period);
      return { hub: hubName, ...computePercentOfDays(weather, condition, period, span) };
    },
  }),

  defineTool({
    name: "get_snowfall_total",
    description:
      "Total snowfall in inches at one hub over a period (including 'last_winter'), plus the number of snow days. Use for 'how much snow' questions. The response includes the exact dates covered and how many days had data.",
    inputSchema: getSnowfallTotalInput,
    run: ({ hub, period }, context) => {
      const { hubName, span, weather } = loadPeriodWeather(context, hub, period);
      return { hub: hubName, ...computeSnowfallTotal(weather, period, span) };
    },
  }),

  defineTool({
    name: "explain_score",
    description:
      "Explain why a hub's composite score is what it is: the measurements that add the most points, and each hazard's score. Use for 'why is X's risk high' questions.",
    inputSchema: explainScoreInput,
    run: ({ hub }, { db }) => {
      const risk = getHubRisk(db, requireHub(hub));
      return {
        hub: risk.hubName,
        composite_score: risk.compositeScore,
        dominant_hazard: risk.dominantHazard,
        rank_among_hubs: loadHubRanks(db, hub),
        hazard_scores: Object.fromEntries(HAZARDS.map((hazard) => [hazard, risk.subScores[hazard].score])),
        top_contributors: explainHubRisk(risk).map((item) => ({ ...item, rawValue: roundMeasurement(item.rawValue, item.unit) })),
        data_window: `${risk.windowStart} to ${risk.windowEnd}`,
        data_gaps: risk.dataGaps,
      };
    },
  }),
];

export function toApiTool(tool: AgentTool): Anthropic.Tool {
  const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    // No `strict` flag: runTool validates every input with the same schema and returns errors to the model.
    input_schema: inputSchema as Anthropic.Tool.InputSchema,
  };
}

export const API_TOOLS: Anthropic.Tool[] = AGENT_TOOLS.map(toApiTool);

export interface ToolOutcome {
  output?: unknown;
  error?: string;
}

// Validates the model's arguments again on our side, and turns failures into messages the model can act on.
export function runTool(name: string, rawInput: unknown, context: ToolContext): ToolOutcome {
  const tool = AGENT_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return { error: `Unknown tool: ${name}` };

  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) return { error: `Invalid input: ${z.prettifyError(parsed.error)}` };

  try {
    return { output: tool.run(parsed.data, context) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
