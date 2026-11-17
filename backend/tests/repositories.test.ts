import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "../src/data/db";
import { getHazardsFetchedAt, getHubHazards, saveHubHazards } from "../src/data/hazardRepository";
import type { DailyWeather } from "../src/data/types";
import { getDailyWeather, getLatestWeatherDate, saveDailyWeather } from "../src/data/weatherRepository";

function makeDay(hubId: string, date: string, snowfallInches = 0): DailyWeather {
  return { hubId, date, snowfallInches, precipitationInches: 0, windGustMph: 10, tempMaxF: 40, tempMinF: 30 };
}

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
});

describe("weather repository", () => {
  it("saves and reads days within an inclusive range", () => {
    saveDailyWeather(db, [makeDay("denver", "2026-01-01"), makeDay("denver", "2026-01-02"), makeDay("denver", "2026-01-03")]);
    const rows = getDailyWeather(db, "denver", "2026-01-02", "2026-01-03");
    expect(rows.map((row) => row.date)).toEqual(["2026-01-02", "2026-01-03"]);
  });

  it("keeps hubs separate", () => {
    saveDailyWeather(db, [makeDay("denver", "2026-01-01"), makeDay("miami", "2026-01-01")]);
    expect(getDailyWeather(db, "miami", "2026-01-01", "2026-01-01")).toHaveLength(1);
  });

  it("overwrites a day instead of duplicating it", () => {
    saveDailyWeather(db, [makeDay("denver", "2026-01-01", 1)]);
    saveDailyWeather(db, [makeDay("denver", "2026-01-01", 5)]);
    const rows = getDailyWeather(db, "denver", "2026-01-01", "2026-01-01");
    expect(rows).toHaveLength(1);
    expect(rows[0].snowfallInches).toBe(5);
  });

  it("reports the newest cached date, or null when empty", () => {
    expect(getLatestWeatherDate(db, "denver")).toBeNull();
    saveDailyWeather(db, [makeDay("denver", "2026-01-01"), makeDay("denver", "2026-02-01")]);
    expect(getLatestWeatherDate(db, "denver")).toBe("2026-02-01");
  });
});

describe("hazard repository", () => {
  const hazards = {
    hubId: "miami",
    hurricaneAnnualFrequency: 0.3,
    coastalFloodAnnualFrequency: 2.25,
    inlandFloodAnnualFrequency: 4,
  };

  it("round-trips a hub's hazards", () => {
    saveHubHazards(db, [hazards], new Date("2026-11-17T00:00:00Z"));
    expect(getHubHazards(db, "miami")).toEqual(hazards);
    expect(getHubHazards(db, "denver")).toBeNull();
  });

  it("tracks when hazards were fetched", () => {
    expect(getHazardsFetchedAt(db)).toBeNull();
    saveHubHazards(db, [hazards], new Date("2026-11-17T00:00:00Z"));
    expect(getHazardsFetchedAt(db)?.toISOString()).toBe("2026-11-17T00:00:00.000Z");
  });
});
