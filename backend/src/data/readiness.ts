import type { Hub } from "../config/hubs";
import type { Db } from "./db";
import { getHubHazards } from "./hazardRepository";
import { getLatestWeatherDate } from "./weatherRepository";

// Scoring needs weather AND FEMA data for every hub; before that, chat would only produce errors.
export function isDataReady(db: Db, hubs: readonly Hub[]): boolean {
  return hubs.every((hub) => getLatestWeatherDate(db, hub.id) !== null && getHubHazards(db, hub.id) !== null);
}
