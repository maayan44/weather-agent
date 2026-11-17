import { describe, expect, it } from "vitest";
import { API_TOOLS, runTool } from "../src/agent/tools";
import { createSeededDb } from "./helpers/seedDatabase";

// A fixed "today" keeps period answers independent of the real clock.
const context = { db: createSeededDb(), today: new Date("2026-11-17T12:00:00Z") };

// Tool outputs are loosely typed on purpose (they become JSON for the model).
function run(name: string, input: unknown): any {
  const outcome = runTool(name, input, context);
  expect(outcome.error).toBeUndefined();
  return outcome.output;
}

describe("API tool definitions", () => {
  it("exposes the five tools with plain JSON schemas", () => {
    expect(API_TOOLS.map((tool) => tool.name)).toEqual([
      "get_hub_risk",
      "rank_hubs",
      "compare_hubs",
      "get_weather_stats",
      "get_snowfall_total",
      "explain_score",
    ]);
    for (const tool of API_TOOLS) {
      expect(tool.input_schema.type).toBe("object");
      expect(JSON.stringify(tool.input_schema)).not.toContain("$schema");
    }
  });

  it("limits hub arguments to the 10 real hubs", () => {
    const schema = JSON.stringify(API_TOOLS.find((tool) => tool.name === "get_hub_risk")!.input_schema);
    expect(schema).toContain("los-angeles");
    expect(schema).not.toContain("paris");
  });
});

describe("get_hub_risk", () => {
  it("returns the composite, all five sub-scores and the data window", () => {
    const result = run("get_hub_risk", { hub: "phoenix" });
    expect(result.hub).toBe("Phoenix");
    expect(result.dominant_hazard).toBe("heat");
    expect(Object.keys(result.sub_scores)).toEqual(["winter", "flood", "hurricane", "heat", "wind"]);
    expect(result.sub_scores.heat.score).toBe(100);
    expect(result.data_window).toBe("2025-11-13 to 2026-11-12");
  });
});

describe("rank_hubs", () => {
  it("ranks all hubs by composite when no filter is given", () => {
    const result = run("rank_hubs", {});
    expect(result.ranked_by).toBe("composite");
    expect(result.ranking).toHaveLength(10);
    expect(result.ranking[0].rank).toBe(1);
  });

  it("ranks one region by one hazard", () => {
    const result = run("rank_hubs", { region: "Midwest", hazard: "winter" });
    expect(result.ranking.map((entry: any) => entry.hub)).toEqual(["Minneapolis", "Chicago", "Detroit"]);
    expect(result.ranking[0].score).toBeGreaterThan(result.ranking[1].score);
  });
});

describe("compare_hubs", () => {
  it("compares two hubs hazard by hazard", () => {
    const result = run("compare_hubs", { hub_a: "miami", hub_b: "houston" });
    const hurricane = result.per_hazard.find((row: any) => row.hazard === "hurricane");
    expect(hurricane.miami).toBe(100);
    expect(hurricane.houston).toBe(0);
    expect(hurricane.higher_risk).toBe("Miami");
  });

  it("refuses to compare a hub with itself", () => {
    expect(runTool("compare_hubs", { hub_a: "miami", hub_b: "miami" }, context).error).toMatch(/different/);
  });
});

describe("get_weather_stats", () => {
  it("counts days for a period relative to the newest data", () => {
    const result = run("get_weather_stats", { hub: "minneapolis", condition: "snowfall", period: "last_12_months" });
    expect(result.daysMatching).toBe(40);
    expect(result.daysWithData).toBe(365);
    expect(result.percentage).toBe(11);
    expect(result.definition).toContain("0.1 in");
  });

  it("reports how many days it really had when the period is only partly covered", () => {
    const result = run("get_weather_stats", { hub: "denver", condition: "snowfall", period: "last_calendar_year" });
    expect(result.daysWithData).toBe(49); // the seeded data starts 2025-11-13, so only Nov 13 - Dec 31 exist
    expect(result.coverage).toBe("partial");
    expect(result.missingDays).toBe(316);
    expect(result.daysMatching).toBe(0);
  });

  it("follows the given 'today', not the newest stored day", () => {
    const january = { ...context, today: new Date("2027-01-03T12:00:00Z") };
    const outcome = runTool("get_weather_stats", { hub: "denver", condition: "snowfall", period: "last_calendar_year" }, january);
    expect((outcome.output as any).startDate).toBe("2026-01-01");
  });
});

describe("get_snowfall_total", () => {
  it("sums snowfall for the period and says which dates it covered", () => {
    // Seeded Minneapolis: 40 snow days of 2 in, all inside the last 12 months
    const result = run("get_snowfall_total", { hub: "minneapolis", period: "last_12_months" });
    expect(result.totalSnowfallInches).toBe(80);
    expect(result.snowDays).toBe(40);
    expect(result.startDate).toBe("2025-11-13");
    expect(result.endDate).toBe("2026-11-12");
    expect(result.snowDayDefinition).toContain("0.1 in");
  });

  it("uses the most recent finished winter", () => {
    const result = run("get_snowfall_total", { hub: "chicago", period: "last_winter" });
    expect(result.startDate).toBe("2025-12-01");
    expect(result.endDate).toBe("2026-02-28");
    expect(result.daysWithData).toBe(90);
    expect(result.totalSnowfallInches).toBe(0);
  });
});

describe("explain_score", () => {
  it("returns the top contributors", () => {
    const result = run("explain_score", { hub: "phoenix" });
    expect(result.top_contributors[0].hazard).toBe("heat");
    expect(result.top_contributors.length).toBeLessThanOrEqual(5);
  });
});

describe("runTool error handling", () => {
  it("rejects a hub that is not in the list, with a message the model can act on", () => {
    const outcome = runTool("get_hub_risk", { hub: "paris" }, context);
    expect(outcome.output).toBeUndefined();
    expect(outcome.error).toMatch(/Invalid input/);
  });

  it("rejects an unknown tool", () => {
    expect(runTool("delete_everything", {}, context).error).toMatch(/Unknown tool/);
  });

  it("turns a missing-data failure into an error message instead of crashing", () => {
    const emptyContext = { db: createSeededDb() };
    emptyContext.db.exec("DELETE FROM daily_weather");
    expect(runTool("get_hub_risk", { hub: "denver" }, emptyContext).error).toMatch(/ingestion/);
  });
});
