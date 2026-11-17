import { describe, expect, it } from "vitest";
import { formatScore, hubLabel, metricLabel } from "./hazards";

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

describe("metricLabel", () => {
  it("calls the composite score Overall", () => {
    expect(metricLabel("composite")).toBe("Overall");
    expect(metricLabel("winter")).toBe("Winter");
  });
});
