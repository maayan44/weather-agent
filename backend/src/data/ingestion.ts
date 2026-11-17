import type { Hub } from "../config/hubs";
import { getMissingWindow } from "./dateRange";
import type { Db } from "./db";
import { fetchHubHazards } from "./femaClient";
import { getHazardsFetchedAt, saveHubHazards } from "./hazardRepository";
import { fetchDailyWeather } from "./openMeteoClient";
import { getLatestWeatherDate, saveDailyWeather } from "./weatherRepository";

// FEMA publishes yearly-ish updates, so refreshing monthly is plenty.
const HAZARD_MAX_AGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IngestionSummary {
  weatherRowsAdded: number;
  hazardsRefreshed: boolean;
}

// Fetches only what the cache is missing, so re-running is cheap and safe.
export async function ingestAll(db: Db, hubs: readonly Hub[], today = new Date()): Promise<IngestionSummary> {
  let weatherRowsAdded = 0;

  // One hub at a time to stay polite to the free API's rate limits.
  for (const hub of hubs) {
    const window = getMissingWindow(today, getLatestWeatherDate(db, hub.id));
    if (!window) continue;
    const rows = await fetchDailyWeather(hub, window);
    saveDailyWeather(db, rows);
    weatherRowsAdded += rows.length;
  }

  const hazardsFetchedAt = getHazardsFetchedAt(db);
  const hazardsAreStale =
    !hazardsFetchedAt || today.getTime() - hazardsFetchedAt.getTime() > HAZARD_MAX_AGE_DAYS * MS_PER_DAY;
  if (hazardsAreStale) saveHubHazards(db, await fetchHubHazards(hubs), today);

  return { weatherRowsAdded, hazardsRefreshed: hazardsAreStale };
}
