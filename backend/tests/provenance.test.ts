import { describe, expect, it } from "vitest";
import { groundAnswer } from "../src/agent/groundAnswer";
import { agentAnswerSchema, type AgentAnswer } from "../src/agent/schemas";
import { runTool } from "../src/agent/tools";
import { findProvenance, scoreProvenance, SOURCES } from "../src/scoring/provenance";
import { createSeededDb } from "./helpers/seedDatabase";

const engine = { source: SOURCES.engine, data_period: "3-year average, 2023-11-14 to 2026-11-12" };
const weather = { source: SOURCES.weather, data_period: "per-year average, 2023-11-14 to 2026-11-12" };
const fema = { source: SOURCES.fema, data_period: "long-run yearly frequency" };

// Shaped like get_hub_risk: scores and ranks at the top, measurements with their own source below.
const hubRiskLike = {
  ...engine,
  composite_score: 32.2,
  rank_among_hubs: { out_of: 10, overall: 3, wind: 6 },
  sub_scores: {
    hurricane: { score: 61.2, weight: 0.2, metrics: [{ name: "FEMA hurricane frequency", value: 0.18, unit: "events/yr", ...fema }] },
    wind: { score: 9.9, weight: 0.15, metrics: [{ name: "Days with gusts of 50 mph or more", value: 3, unit: "days/yr", ...weather }] },
  },
};

describe("findProvenance", () => {
  it("takes the source and period from the nearest object that states them", () => {
    expect(findProvenance(0.18, "events/yr", [hubRiskLike])).toEqual(fema);
    expect(findProvenance(32.2, "score", [hubRiskLike])).toEqual(engine);
  });

  it("uses the unit when the same number means two things (3 gust days and a rank of 3)", () => {
    expect(findProvenance(3, "days/yr", [hubRiskLike])).toEqual(weather);
    expect(findProvenance(3, "days per year", [hubRiskLike])).toEqual(weather);
  });

  it("reads the unit from a stats field name, so '7 days in 6 months' is not confused with a per-year count", () => {
    const stats = { source: SOURCES.weather, data_period: "2026-05-13 to 2026-11-12", daysMatching: 7, totalSnowfallInches: 0 };
    const yearly = { ...hubRiskLike, sub_scores: { winter: { metrics: [{ value: 7, unit: "days/yr", ...weather }, { value: 0, unit: "in/yr", ...weather }] } } };
    expect(findProvenance(7, "days", [stats, yearly])).toEqual({ source: SOURCES.weather, data_period: "2026-05-13 to 2026-11-12" });
    expect(findProvenance(0, "inches", [stats, yearly])).toEqual({ source: SOURCES.weather, data_period: "2026-05-13 to 2026-11-12" });
    expect(findProvenance(7, "days/yr", [stats, yearly])).toEqual(weather);
    // Seen in a live answer: the model added a note in brackets to the unit.
    expect(findProvenance(7, "days (3.8% of 184 days)", [stats, yearly])).toEqual({ source: SOURCES.weather, data_period: "2026-05-13 to 2026-11-12" });
  });

  it("gives no label when even the unit cannot tell: better none than a wrong one", () => {
    expect(findProvenance(3, "", [hubRiskLike])).toBeNull();
    expect(findProvenance(7, "days", [{ ...weather, a: 7 }, { ...fema, b: 7 }])).toBeNull();
  });

  it("gives no label for a number no tool returned, or one in a result that states no source", () => {
    expect(findProvenance(99, "days", [hubRiskLike])).toBeNull();
    expect(findProvenance(7, "days", [{ a: 7 }])).toBeNull();
  });
});

describe("the answer check attaches them to figures", () => {
  const answerWith = (figures: AgentAnswer["figures"]): AgentAnswer => ({
    in_scope: true, answer: "x", ranking: [], figures, reasoning: [], assumptions: [], confidence: "high", data_gaps: [],
  });

  it("labels each figure from the tool result that holds it", () => {
    const answer = answerWith([
      { label: "Hurricanes", value: 0.18, unit: "events/yr" },
      { label: "Severe gust days", value: 3, unit: "days/yr" },
    ]);
    const [hurricanes, gusts] = groundAnswer(answer, [hubRiskLike], () => 0).answer.figures;
    expect(hurricanes).toMatchObject(fema);
    expect(gusts).toMatchObject(weather);
  });

  it("never keeps a source the model wrote: its answer format drops the field before the check runs", () => {
    const written = { ...answerWith([]), figures: [{ label: "Hurricanes", value: 0.18, unit: "events/yr", source: "my memory" }] };
    expect(agentAnswerSchema.parse(written).figures[0]).not.toHaveProperty("source");
  });

  it("does not label a score the model wrote as a measurement (45 is a score, not 45 days a year)", () => {
    const metricWithScore = { ...engine, metrics: [{ name: "Days with snow", value: 20.3, unit: "days/yr", score: 45, ...weather }] };
    const [figure] = groundAnswer(answerWith([{ label: "Snow days", value: 45, unit: "days/yr" }]), [metricWithScore], () => 0).answer.figures;
    expect(figure.source).toBeUndefined();
    expect(findProvenance(45, "score (0-100)", [metricWithScore])).toEqual(weather);
    expect(findProvenance(20.3, "days per year", [metricWithScore])).toEqual(weather);
  });
});

describe("the tools state where their numbers come from", () => {
  const db = createSeededDb();

  it("get_hub_risk marks scores as the engine's, FEMA metrics as FEMA and weather metrics as Open-Meteo", () => {
    const output = runTool("get_hub_risk", { hub: "houston" }, { db }).output as typeof hubRiskLike;
    expect(output.source).toBe(SOURCES.engine);
    // The seeded cache holds one year, and the label says so instead of claiming 3 years.
    expect(output.data_period).toMatch(/^average over the 365-day window, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/);
    expect(output.sub_scores.hurricane.metrics[0].source).toBe(SOURCES.fema);
    expect(output.sub_scores.wind.metrics[0].source).toBe(SOURCES.weather);
  });

  it("a stats tool states the exact dates it covers", () => {
    const output = runTool("get_snowfall_total", { hub: "denver", period: "last_winter" }, { db, today: new Date("2026-11-17T00:00:00Z") })
      .output as { source: string; data_period: string; startDate: string; endDate: string };
    expect(output.source).toBe(SOURCES.weather);
    expect(output.data_period).toBe(`${output.startDate} to ${output.endDate}`);
  });
});

describe("the window wording follows the data", () => {
  it("says 3-year only when the data covers it", () => {
    expect(scoreProvenance({ windowStart: "2023-11-14", windowEnd: "2026-11-12", daysOfData: 1095 }).data_period).toBe(
      "average over the 3-year window, 2023-11-14 to 2026-11-12",
    );
    expect(scoreProvenance({ windowStart: "2024-12-01", windowEnd: "2026-11-12", daysOfData: 712 }).data_period).toBe(
      "average over the 712-day window, 2024-12-01 to 2026-11-12",
    );
  });
});
