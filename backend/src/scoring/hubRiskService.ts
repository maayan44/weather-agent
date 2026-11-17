import { SCORING_WINDOW_DAYS } from "../config/scoring";
import { requireHub, type Hub } from "../config/hubs";
import { addDays } from "../data/dateRange";
import type { Db } from "../data/db";
import { getHubHazards } from "../data/hazardRepository";
import { getDailyWeather, getLatestWeatherDate } from "../data/weatherRepository";
import { computeHubRisk } from "./hubRisk";
import type { HubRisk, RankingKey } from "./types";

// Reads the cache and scores one hub over the newest 365 days available for it.
export function getHubRisk(db: Db, hub: Hub): HubRisk {
  const windowEnd = getLatestWeatherDate(db, hub.id);
  if (!windowEnd) throw new Error(`No cached weather for ${hub.name}. Run the ingestion first.`);

  const hazards = getHubHazards(db, hub.id);
  if (!hazards) throw new Error(`No cached FEMA data for ${hub.name}. Run the ingestion first.`);

  const windowStart = addDays(windowEnd, -(SCORING_WINDOW_DAYS - 1));
  return computeHubRisk(hub, { weather: getDailyWeather(db, hub.id, windowStart, windowEnd), hazards });
}

// The engine's score for one hub and metric: the reference value for checking what the model says.
export function getHubScore(db: Db, hubId: string, metric: RankingKey): number {
  const risk = getHubRisk(db, requireHub(hubId));
  return metric === "composite" ? risk.compositeScore : risk.subScores[metric].score;
}

export function getAllHubRisks(db: Db, hubs: readonly Hub[]): HubRisk[] {
  return hubs.map((hub) => getHubRisk(db, hub));
}
