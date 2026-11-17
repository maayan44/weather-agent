import { describe, expect, it } from "vitest";
import { formatScore, formatUnit, hubLabel, metricLabel } from "./hazards";

describe("hubLabel", () => {
  it("turns every hub id into its display name", () => {
    const ids = ["chicago", "minneapolis", "detroit", "denver", "dallas", "houston", "miami", "atlanta", "phoenix", "los-angeles"];
    expect(ids.map(hubLabel)).toEqual(["Chicago", "Minneapolis", "Detroit", "Denver", "Dallas", "Houston", "Miami", "Atlanta", "Phoenix", "Los Angeles"]);
  });
});

describe("formatScore", () => {
  it("shows whole numbers plainly and others with one decimal", () => {
    expect(formatScore(85)).toBe("85");
    expect(formatScore(61.2)).toBe("61.2");
    expect(formatScore(0)).toBe("0");
  });
});

describe("formatUnit", () => {
  it("uses the singular for exactly 1: no more \"1 days\"", () => {
    expect(formatUnit(1, "days")).toBe("day");
    expect(formatUnit(1, "events/yr")).toBe("event/yr");
    expect(formatUnit(1, "inches")).toBe("inch");
  });

  it("leaves every other value, and units without a plural, as written", () => {
    expect(formatUnit(0, "days")).toBe("days");
    expect(formatUnit(2, "days")).toBe("days");
    expect(formatUnit(1.5, "days")).toBe("days");
    expect(formatUnit(1, "%")).toBe("%");
    expect(formatUnit(1, "score (0-100)")).toBe("score (0-100)");
  });
});

describe("metricLabel", () => {
  it("calls the composite score Overall", () => {
    expect(metricLabel("composite")).toBe("Overall");
    expect(metricLabel("winter")).toBe("Winter");
  });
});
