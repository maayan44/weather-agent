import { describe, expect, it } from "vitest";
import type { RankingEntry, ScoreMetric } from "@/api/types";
import { describeHiddenRisks, EXPOSURE_LEGEND, exposureLevel, hiddenRisks } from "./exposure";

const entry = (metric: ScoreMetric, score: number): RankingEntry => ({ rank: 1, hub_id: "chicago", metric, score, note: "" });

// Chicago on the live site: an overall score of 36 that hides a wind score of 79 and a winter score of 60.
const chicago = [entry("composite", 36.3), entry("wind", 79.2), entry("winter", 59.9), entry("flood", 44), entry("hurricane", 3.1), entry("heat", 0.4)];

describe("exposureLevel", () => {
  it("puts the bands at 25 and 50, with the boundary belonging to the higher band", () => {
    expect([0, 24.9, 25, 49.9, 50, 79.2, 100].map(exposureLevel)).toEqual(["low", "low", "moderate", "moderate", "high", "high", "high"]);
  });

  it("describes the bands in a legend", () => {
    expect(EXPOSURE_LEGEND).toBe("High 50+ · Moderate 25-49 · Low under 25");
  });
});

describe("hiddenRisks: the risk the overall score hides", () => {
  it("finds the hazards that are high although the overall score is not (Chicago: wind and winter)", () => {
    expect(hiddenRisks(chicago).map((item) => item.metric)).toEqual(["wind", "winter"]);
  });

  it("finds nothing when the overall score is already high", () => {
    expect(hiddenRisks([entry("composite", 62), entry("wind", 80), entry("winter", 70)])).toEqual([]);
  });

  it("finds nothing when no single hazard is high", () => {
    expect(hiddenRisks([entry("composite", 30), entry("wind", 45), entry("winter", 20)])).toEqual([]);
  });

  it("finds nothing without an overall score to compare against", () => {
    expect(hiddenRisks([entry("wind", 80), entry("winter", 70)])).toEqual([]);
  });
});

describe("describeHiddenRisks", () => {
  it("says it in a sentence, naming each hazard and its score", () => {
    expect(describeHiddenRisks(chicago)).toBe("The overall score averages five hazards, so it understates Wind (79.2) and Winter (59.9).");
  });

  it("handles one hazard and three hazards", () => {
    expect(describeHiddenRisks([entry("composite", 20), entry("heat", 100)])).toBe("The overall score averages five hazards, so it understates Heat (100).");
    expect(describeHiddenRisks([entry("composite", 40), entry("heat", 90), entry("wind", 80), entry("flood", 55)])).toBe(
      "The overall score averages five hazards, so it understates Heat (90), Wind (80) and Flood (55).",
    );
  });

  it("returns null when there is nothing hidden", () => {
    expect(describeHiddenRisks([entry("composite", 30), entry("wind", 40)])).toBeNull();
  });
});
