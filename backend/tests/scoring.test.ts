import { beforeEach, describe, expect, it } from "vitest";
import { HAZARD_CONFIG, HAZARDS, SCORING_WINDOW_DAYS, type MetricId } from "../src/config/scoring";
import { getHub } from "../src/config/hubs";
import { addDays } from "../src/data/dateRange";
import { openDatabase, type Db } from "../src/data/db";
import { saveHubHazards } from "../src/data/hazardRepository";
import type { DailyWeather, HubHazards } from "../src/data/types";
import { saveDailyWeather } from "../src/data/weatherRepository";
import { computeHubRisk } from "../src/scoring/hubRisk";
import { getHubRisk } from "../src/scoring/hubRiskService";
import { METRIC_EXTRACTORS } from "../src/scoring/metrics";
import { roundScore, scaleToScore } from "../src/scoring/normalize";
import { rankHubs } from "../src/scoring/ranking";
import { computeSubScore } from "../src/scoring/subScores";

const QUIET_DAY = { snowfallInches: 0, precipitationInches: 0, windGustMph: 10, tempMaxF: 60, tempMinF: 45 };
const NO_HAZARDS: HubHazards = {
  hubId: "test",
  hurricaneAnnualFrequency: 0,
  coastalFloodAnnualFrequency: 0,
  inlandFloodAnnualFrequency: 0,
};

// Builds consecutive days from 2025-01-01; `shape` can change any day.
function makeWeather(count: number, shape: (index: number) => Partial<DailyWeather> = () => ({})): DailyWeather[] {
  return Array.from({ length: count }, (_, index) => ({
    hubId: "test",
    date: addDays("2025-01-01", index),
    ...QUIET_DAY,
    ...shape(index),
  }));
}

describe("scaleToScore", () => {
  it("maps anchors to 0 and 100 and interpolates between", () => {
    expect(scaleToScore(0, 0, 12)).toBe(0);
    expect(scaleToScore(12, 0, 12)).toBe(100);
    expect(scaleToScore(6, 0, 12)).toBe(50);
  });

  it("clamps values beyond the anchors", () => {
    expect(scaleToScore(-5, 0, 12)).toBe(0);
    expect(scaleToScore(99, 0, 12)).toBe(100);
  });

  it("rejects identical anchors", () => {
    expect(() => scaleToScore(1, 5, 5)).toThrow();
  });

  it("rounds to one decimal", () => {
    expect(roundScore(29.5238)).toBe(29.5);
  });
});

describe("scoring config", () => {
  it("has hazard weights that sum to 1", () => {
    const total = HAZARDS.reduce((sum, hazard) => sum + HAZARD_CONFIG[hazard].weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("has metric weights that sum to 1 inside every hazard", () => {
    for (const hazard of HAZARDS) {
      const total = HAZARD_CONFIG[hazard].metrics.reduce((sum, metric) => sum + metric.weight, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it("has an extractor for every configured metric", () => {
    for (const hazard of HAZARDS) {
      for (const metric of HAZARD_CONFIG[hazard].metrics) {
        expect(METRIC_EXTRACTORS[metric.id as MetricId]).toBeTypeOf("function");
      }
    }
  });
});

describe("metric extractors", () => {
  it("counts days at or above each threshold (boundaries included)", () => {
    // 365 days = exactly one year, so a count is already a per-year figure.
    const weather = makeWeather(365, (index) => [{ windGustMph: 40 }, { windGustMph: 39.9 }, { windGustMph: 50 }][index] ?? {});
    const input = { weather, hazards: NO_HAZARDS };
    expect(METRIC_EXTRACTORS.gustDays(input)).toBe(2);
    expect(METRIC_EXTRACTORS.severeGustDays(input)).toBe(1);
  });

  it("sums snowfall and counts freezing days", () => {
    const weather = makeWeather(365, (index) => [{ snowfallInches: 1.5, tempMaxF: 32 }, { snowfallInches: 0.5, tempMaxF: 33 }][index] ?? {});
    const input = { weather, hazards: NO_HAZARDS };
    expect(METRIC_EXTRACTORS.totalSnowfall(input)).toBe(2);
    expect(METRIC_EXTRACTORS.snowDays(input)).toBe(1);
    expect(METRIC_EXTRACTORS.freezingDays(input)).toBe(1);
  });

  it("turns counts into per-year figures: 3 years with 3 snow days is 1 a year", () => {
    const weather = makeWeather(SCORING_WINDOW_DAYS, (index) => (index < 3 ? { snowfallInches: 2 } : {}));
    const input = { weather, hazards: NO_HAZARDS };
    expect(METRIC_EXTRACTORS.snowDays(input)).toBeCloseTo(1, 10);
    expect(METRIC_EXTRACTORS.totalSnowfall(input)).toBeCloseTo(2, 10);
  });

  it("scales by the days actually available, so a data gap does not look like calm weather", () => {
    const weather = makeWeather(Math.floor(SCORING_WINDOW_DAYS / 2), (index) => (index < 3 ? { snowfallInches: 2 } : {}));
    expect(METRIC_EXTRACTORS.snowDays({ weather, hazards: NO_HAZARDS })).toBeCloseTo(2, 1);
  });

  it("passes FEMA frequencies through unchanged", () => {
    const hazards = { ...NO_HAZARDS, hurricaneAnnualFrequency: 0.3, coastalFloodAnnualFrequency: 2, inlandFloodAnnualFrequency: 5 };
    const input = { weather: makeWeather(1), hazards };
    expect(METRIC_EXTRACTORS.hurricaneFrequency(input)).toBe(0.3);
    expect(METRIC_EXTRACTORS.coastalFloodFrequency(input)).toBe(2);
    expect(METRIC_EXTRACTORS.inlandFloodFrequency(input)).toBe(5);
  });
});

describe("sub-scores", () => {
  it("averages the winter metrics (hand-computed)", () => {
    // 6 snow days of 2 in, all freezing: 50 (6/12 days), 30 (12/40 in), 8.571 (6/70 days) -> mean 29.524
    const weather = makeWeather(365, (index) => (index < 6 ? { snowfallInches: 2, tempMaxF: 30 } : {}));
    const winter = computeSubScore("winter", { weather, hazards: NO_HAZARDS });
    expect(winter.score).toBeCloseTo(29.5238, 3);
    expect(winter.metrics.map((metric) => metric.rawValue)).toEqual([6, 12, 6]);
  });

  it("scores hurricane from FEMA frequency and clamps at 100", () => {
    const weather = makeWeather(1);
    expect(computeSubScore("hurricane", { weather, hazards: { ...NO_HAZARDS, hurricaneAnnualFrequency: 0.15 } }).score).toBeCloseTo(50, 10);
    expect(computeSubScore("hurricane", { weather, hazards: { ...NO_HAZARDS, hurricaneAnnualFrequency: 0.9 } }).score).toBe(100);
  });

  it("weights the flood metrics 0.4 / 0.3 / 0.3 (hand-computed)", () => {
    // inland 4/8 = 50, coastal 2/4 = 50, rain 0 -> 0.4*50 + 0.3*50 + 0 = 35
    const hazards = { ...NO_HAZARDS, inlandFloodAnnualFrequency: 4, coastalFloodAnnualFrequency: 2 };
    expect(computeSubScore("flood", { weather: makeWeather(5), hazards }).score).toBeCloseTo(35, 10);
  });
});

describe("computeHubRisk", () => {
  const phoenix = getHub("phoenix")!;
  const fullYear = SCORING_WINDOW_DAYS;

  it("scores a perfectly quiet hub at 0", () => {
    const risk = computeHubRisk(phoenix, { weather: makeWeather(fullYear), hazards: NO_HAZARDS });
    expect(risk.compositeScore).toBe(0);
    expect(risk.dataGaps).toEqual([]);
  });

  it("scores a heat-only hub at the heat weight and names heat dominant", () => {
    // All 365 days at 106°F: both heat metrics hit 100, heat weight 0.2 -> composite 20
    const weather = makeWeather(fullYear, () => ({ tempMaxF: 106 }));
    const risk = computeHubRisk(phoenix, { weather, hazards: NO_HAZARDS });
    expect(risk.subScores.heat.score).toBe(100);
    expect(risk.compositeScore).toBe(20);
    expect(risk.dominantHazard).toBe("heat");
  });

  it("reports no dominant hazard when every hazard scores 0", () => {
    const risk = computeHubRisk(phoenix, { weather: makeWeather(fullYear), hazards: NO_HAZARDS });
    expect(risk.dominantHazard).toBeNull();
  });

  it("breaks dominant-hazard ties by the fixed hazard order", () => {
    // Flood: inland 8/yr (100 x 0.4) + coastal 4/yr (100 x 0.3) = 70. Hurricane: 0.21 of 0.3/yr = 70. A tie.
    const hazards = { ...NO_HAZARDS, inlandFloodAnnualFrequency: 8, coastalFloodAnnualFrequency: 4, hurricaneAnnualFrequency: 0.21 };
    const risk = computeHubRisk(phoenix, { weather: makeWeather(fullYear), hazards });
    expect(risk.subScores.flood.score).toBeCloseTo(risk.subScores.hurricane.score, 5);
    expect(risk.dominantHazard).toBe("flood"); // flood comes before hurricane in the fixed order
  });

  it("reports the data window and flags thin data", () => {
    const risk = computeHubRisk(phoenix, { weather: makeWeather(100), hazards: NO_HAZARDS });
    expect(risk.windowStart).toBe("2025-01-01");
    expect(risk.windowEnd).toBe("2025-04-10");
    expect(risk.daysOfData).toBe(100);
    expect(risk.dataGaps[0]).toContain("100 of 1095");
  });

  it("flags a season that is missing many days, even when total coverage looks fine", () => {
    // 3 years from Jan 1 with the first 60 days gone: 95% of all days remain (no overall warning),
    // but Jan 1 to Feb 28 is 59 of the 270 winter days, so winter is under 90% covered.
    const weather = makeWeather(fullYear).filter((_, index) => index >= 60);
    const risk = computeHubRisk(phoenix, { weather, hazards: NO_HAZARDS });
    expect(risk.dataGaps).toEqual([
      "Winter is missing 59 of 270 days of weather data, so winter hazards may read lower than they are.",
    ]);
  });

  it("adds no season warning when every season is covered", () => {
    expect(computeHubRisk(phoenix, { weather: makeWeather(fullYear), hazards: NO_HAZARDS }).dataGaps).toEqual([]);
  });

  it("is deterministic and ignores the order of the input days", () => {
    const weather = makeWeather(fullYear, (index) => ({ snowfallInches: index % 7, tempMaxF: 20 + (index % 90) }));
    const hazards = { ...NO_HAZARDS, hurricaneAnnualFrequency: 0.1 };
    const first = computeHubRisk(phoenix, { weather, hazards });
    const second = computeHubRisk(phoenix, { weather: [...weather].reverse(), hazards });
    expect(second).toEqual(first);
  });

  it("refuses to score a hub with no weather", () => {
    expect(() => computeHubRisk(phoenix, { weather: [], hazards: NO_HAZARDS })).toThrow(/Phoenix/);
  });
});

describe("rankHubs", () => {
  const snowy = computeHubRisk(getHub("minneapolis")!, {
    weather: makeWeather(365, () => ({ snowfallInches: 2, tempMaxF: 20 })),
    hazards: NO_HAZARDS,
  });
  const hot = computeHubRisk(getHub("phoenix")!, {
    weather: makeWeather(365, () => ({ tempMaxF: 110 })),
    hazards: NO_HAZARDS,
  });
  const quiet = computeHubRisk(getHub("los-angeles")!, { weather: makeWeather(365), hazards: NO_HAZARDS });

  it("ranks highest first by the chosen hazard", () => {
    expect(rankHubs([quiet, hot, snowy], "winter").map((entry) => entry.risk.hubName)).toEqual(["Minneapolis", "Los Angeles", "Phoenix"]);
    expect(rankHubs([quiet, snowy, hot], "heat")[0].risk.hubName).toBe("Phoenix");
  });

  it("numbers ranks from 1 and carries the score used", () => {
    const ranked = rankHubs([quiet, hot], "heat");
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(ranked[0].score).toBe(100);
  });

  it("breaks ties by hub name so order is stable", () => {
    const ranked = rankHubs([quiet, snowy, hot], "hurricane"); // all 0
    expect(ranked.map((entry) => entry.risk.hubName)).toEqual(["Los Angeles", "Minneapolis", "Phoenix"]);
  });

  it("does not modify the list it was given", () => {
    const input = [quiet, hot, snowy];
    rankHubs(input, "composite");
    expect(input.map((risk) => risk.hubName)).toEqual(["Los Angeles", "Phoenix", "Minneapolis"]);
  });
});

describe("hub risk service", () => {
  let db: Db;
  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  it("scores only the newest 3 years of the cache", () => {
    saveDailyWeather(db, makeWeather(SCORING_WINDOW_DAYS + 35).map((day) => ({ ...day, hubId: "denver" })));
    saveHubHazards(db, [{ ...NO_HAZARDS, hubId: "denver" }], new Date());
    const risk = getHubRisk(db, getHub("denver")!);
    expect(risk.daysOfData).toBe(SCORING_WINDOW_DAYS);
    expect(risk.windowEnd).toBe(addDays("2025-01-01", SCORING_WINDOW_DAYS + 34));
    expect(risk.windowStart).toBe(addDays("2025-01-01", 35));
  });

  it("explains what is missing when the cache is empty", () => {
    expect(() => getHubRisk(db, getHub("denver")!)).toThrow(/ingestion/);
  });
});
