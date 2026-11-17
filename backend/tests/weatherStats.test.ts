import { describe, expect, it } from "vitest";
import type { DailyWeather } from "../src/data/types";
import { computePercentOfDays, computeSnowfallTotal, resolvePeriod } from "../src/scoring/weatherStats";

function day(date: string, snowfallInches: number): DailyWeather {
  return { hubId: "denver", date, snowfallInches, precipitationInches: 0, windGustMph: 10, tempMaxF: 50, tempMinF: 30 };
}

describe("resolvePeriod", () => {
  const latest = "2026-11-12";

  it("anchors every period on the newest cached day", () => {
    expect(resolvePeriod("last_calendar_year", latest)).toEqual({ startDate: "2025-01-01", endDate: "2025-12-31" });
    expect(resolvePeriod("year_to_date", latest)).toEqual({ startDate: "2026-01-01", endDate: "2026-11-12" });
    expect(resolvePeriod("last_12_months", latest)).toEqual({ startDate: "2025-11-13", endDate: "2026-11-12" });
  });
});

describe("resolvePeriod: last_winter", () => {
  it("picks the winter that just finished once March has started", () => {
    expect(resolvePeriod("last_winter", "2026-11-12")).toEqual({ startDate: "2025-12-01", endDate: "2026-02-28" });
    expect(resolvePeriod("last_winter", "2026-03-01")).toEqual({ startDate: "2025-12-01", endDate: "2026-02-28" });
  });

  it("skips a winter that is still in progress", () => {
    expect(resolvePeriod("last_winter", "2026-02-10")).toEqual({ startDate: "2024-12-01", endDate: "2025-02-28" });
    expect(resolvePeriod("last_winter", "2026-01-15")).toEqual({ startDate: "2024-12-01", endDate: "2025-02-28" });
  });

  it("ends on Feb 29 in a leap year", () => {
    expect(resolvePeriod("last_winter", "2024-06-01").endDate).toBe("2024-02-29");
  });
});

describe("computeSnowfallTotal", () => {
  it("adds up snowfall, rounds to one decimal and counts snow days", () => {
    const weather = [day("2025-01-01", 0.55), day("2025-01-02", 0.04), day("2025-01-03", 1.2)];
    const result = computeSnowfallTotal(weather, "last_winter", { startDate: "2025-01-01", endDate: "2025-01-03" });
    expect(result.totalSnowfallInches).toBe(1.8);
    expect(result.snowDays).toBe(2); // 0.04 is a trace
    expect(result.daysWithData).toBe(3);
  });

  it("returns zero totals for no data", () => {
    const result = computeSnowfallTotal([], "year_to_date", { startDate: "2026-01-01", endDate: "2026-01-02" });
    expect(result.totalSnowfallInches).toBe(0);
    expect(result.daysWithData).toBe(0);
  });
});

describe("computePercentOfDays", () => {
  const span = { startDate: "2025-01-01", endDate: "2025-01-04" };

  it("counts matching days and returns a one-decimal percentage", () => {
    const weather = [day("2025-01-01", 0.5), day("2025-01-02", 0), day("2025-01-03", 0.1), day("2025-01-04", 0.05)];
    const result = computePercentOfDays(weather, "snowfall", "last_calendar_year", span);
    expect(result.daysMatching).toBe(2); // 0.1 counts, 0.05 is a trace
    expect(result.daysWithData).toBe(4);
    expect(result.percentage).toBe(50);
    expect(result.definition).toContain("0.1 in");
  });

  it("rounds to one decimal", () => {
    const weather = [day("2025-01-01", 1), day("2025-01-02", 0), day("2025-01-03", 0)];
    expect(computePercentOfDays(weather, "snowfall", "last_calendar_year", span).percentage).toBe(33.3);
  });

  it("returns 0 instead of dividing by zero when there is no data", () => {
    const result = computePercentOfDays([], "snowfall", "year_to_date", span);
    expect(result.percentage).toBe(0);
    expect(result.daysWithData).toBe(0);
  });
});
