import { FEMA_SNAPSHOT } from "../config/femaSnapshot";
import type { Hub } from "../config/hubs";
import { getFetchWindow, getWantedRange } from "./dateRange";
import type { Db } from "./db";
import { fetchHubHazards } from "./femaClient";
import { getHazardsFetchedAt, getHubHazards, saveHubHazards } from "./hazardRepository";
import { fetchDailyWeather } from "./openMeteoClient";
import { countStoredDays, saveDailyWeather } from "./weatherRepository";

// FEMA publishes yearly-ish updates, so refreshing monthly is plenty.
const HAZARD_MAX_AGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IngestionSummary {
  weatherRowsSaved: number;
  hazardsSource: "fema" | "snapshot" | "unchanged";
  // Each failure is isolated, so one broken hub or FEMA outage never blocks the rest.
  failures: string[];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function refreshWeather(db: Db, hubs: readonly Hub[], today: Date, failures: string[]): Promise<number> {
  const wanted = getWantedRange(today);
  let saved = 0;

  // One hub at a time to stay polite to the free API's rate limits.
  for (const hub of hubs) {
    try {
      const window = getFetchWindow(wanted, countStoredDays(db, hub.id, wanted.startDate, wanted.endDate));
      const rows = await fetchDailyWeather(hub, window);
      saveDailyWeather(db, rows);
      saved += rows.length;
    } catch (error) {
      failures.push(`${hub.name} weather: ${describe(error)}`);
    }
  }
  return saved;
}

async function refreshHazards(db: Db, hubs: readonly Hub[], today: Date, failures: string[]): Promise<IngestionSummary["hazardsSource"]> {
  const fetchedAt = getHazardsFetchedAt(db);
  const isStale = !fetchedAt || today.getTime() - fetchedAt.getTime() > HAZARD_MAX_AGE_DAYS * MS_PER_DAY;
  if (!isStale) return "unchanged";

  try {
    saveHubHazards(db, await fetchHubHazards(hubs), today);
    return "fema";
  } catch (error) {
    failures.push(`FEMA: ${describe(error)}`);
    if (hubs.every((hub) => getHubHazards(db, hub.id) !== null)) return "unchanged";
    // Dated 1970 on purpose: the snapshot counts as stale, so the next refresh tries FEMA again.
    saveHubHazards(db, FEMA_SNAPSHOT.filter((row) => hubs.some((hub) => hub.id === row.hubId)), new Date(0));
    return "snapshot";
  }
}

// Fetches what the cache is missing plus the newest days, so re-running is cheap and safe.
export async function ingestAll(db: Db, hubs: readonly Hub[], today = new Date()): Promise<IngestionSummary> {
  const failures: string[] = [];
  const weatherRowsSaved = await refreshWeather(db, hubs, today, failures);
  const hazardsSource = await refreshHazards(db, hubs, today, failures);
  return { weatherRowsSaved, hazardsSource, failures };
}
