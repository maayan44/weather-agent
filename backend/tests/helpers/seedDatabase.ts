import { HUBS } from "../../src/config/hubs";
import { addDays } from "../../src/data/dateRange";
import { openDatabase, type Db } from "../../src/data/db";
import { saveHubHazards } from "../../src/data/hazardRepository";
import type { DailyWeather } from "../../src/data/types";
import { saveDailyWeather } from "../../src/data/weatherRepository";

export const FIRST_DAY = "2025-11-13";
export const LAST_DAY = addDays(FIRST_DAY, 364); // 2026-11-12

const QUIET_DAY = { snowfallInches: 0, precipitationInches: 0, windGustMph: 10, tempMaxF: 60, tempMinF: 45 };

// Small, predictable world: Minneapolis is snowy, Phoenix is hot, Miami is hurricane-prone, the rest are quiet.
function makeYear(hubId: string): DailyWeather[] {
  return Array.from({ length: 365 }, (_, index) => {
    const snowy = hubId === "minneapolis" && index < 40;
    const hot = hubId === "phoenix";
    return {
      hubId,
      date: addDays(FIRST_DAY, index),
      ...QUIET_DAY,
      ...(snowy ? { snowfallInches: 2, tempMaxF: 25 } : {}),
      ...(hot ? { tempMaxF: 110 } : {}),
    };
  });
}

export function createSeededDb(): Db {
  const db = openDatabase(":memory:");
  for (const hub of HUBS) saveDailyWeather(db, makeYear(hub.id));
  saveHubHazards(
    db,
    HUBS.map((hub) => ({
      hubId: hub.id,
      hurricaneAnnualFrequency: hub.id === "miami" ? 0.3 : 0,
      coastalFloodAnnualFrequency: 0,
      inlandFloodAnnualFrequency: 0,
    })),
    new Date("2026-11-13T00:00:00Z"),
  );
  return db;
}
