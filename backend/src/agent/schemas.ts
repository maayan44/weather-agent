import { z } from "zod";
import { HUB_IDS, REGIONS } from "../config/hubs";
import { HAZARDS } from "../config/scoring";
import { DAY_CONDITION_IDS } from "../scoring/dayConditions";
import { STATS_PERIODS } from "../scoring/weatherStats";

// ---- Tool inputs: what the model may ask our code to do ----

const hubIdSchema = z.enum(HUB_IDS).describe("Hub id, e.g. 'denver' or 'los-angeles'");
const hazardSchema = z.enum(HAZARDS);

export const getHubRiskInput = z.object({ hub: hubIdSchema });

export const rankHubsInput = z.object({
  region: z.enum(REGIONS).optional().describe("Only rank hubs in this region. Omit to rank all hubs."),
  hazard: hazardSchema.optional().describe("Rank by this hazard's sub-score. Omit to rank by the composite score."),
});

export const compareHubsInput = z.object({ hub_a: hubIdSchema, hub_b: hubIdSchema });

export const getWeatherStatsInput = z.object({
  hub: hubIdSchema,
  condition: z.enum(DAY_CONDITION_IDS).describe("The kind of day to count, e.g. 'snowfall' for days with snow."),
  period: z.enum(STATS_PERIODS).describe(
    "last_calendar_year = the previous calendar year. last_6_months, last_3_months and last_30_days end at the newest data. Periods under a year miss seasons.",
  ),
});

export const getSnowfallTotalInput = z.object({
  hub: hubIdSchema,
  period: z.enum(STATS_PERIODS).describe(
    "last_winter = Dec 1 to end of Feb, the most recent finished winter. last_6_months, last_3_months and last_30_days end at the newest data.",
  ),
});

export const explainScoreInput = z.object({ hub: hubIdSchema });

// ---- Final answer: the JSON contract between the LLM and our code ----

const rankingEntrySchema = z.object({
  rank: z.number().describe("1 for the highest risk"),
  hub_id: hubIdSchema,
  metric: z.enum(["composite", ...HAZARDS]).describe("Which score this entry shows"),
  score: z.number().describe("Copy exactly from a tool result"),
  note: z.string().describe("One short reason for this position"),
});

const figureSchema = z.object({
  label: z.string().describe("What the number is, including the hub and period"),
  value: z.number().describe("Copy exactly from a tool result; never compute or estimate"),
  unit: z.string(),
});

export const agentAnswerSchema = z.object({
  in_scope: z.boolean().describe("False when the question is outside the 10 hubs or the weather-risk topic"),
  answer: z.string().describe("The direct answer, 1 to 4 plain sentences"),
  ranking: z.array(rankingEntrySchema).describe("Ordered highest risk first. Empty when not ranking hubs."),
  figures: z.array(figureSchema).describe("Every other number quoted in the answer, e.g. percentages and day counts"),
  reasoning: z.array(z.string()).describe("Short bullets explaining why, from tool results only"),
  assumptions: z.array(z.string()).describe("Definitions and choices behind the answer, e.g. what counts as a snow day"),
  confidence: z.enum(["high", "medium", "low"]),
  data_gaps: z.array(z.string()).describe("Missing data, caveats and what the answer cannot tell"),
});

// The answer after the code check: each figure may gain its source and period, copied by code from the tool result
// that holds its value. Never part of what the model writes, so the model cannot get them wrong.
export const checkedAnswerSchema = agentAnswerSchema.extend({
  figures: z.array(figureSchema.extend({ source: z.string().optional(), data_period: z.string().optional() })),
});

export type AgentAnswer = z.infer<typeof checkedAnswerSchema>;
