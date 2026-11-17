import { API_CONFIG } from "../config/api";
import type { Hub } from "../config/hubs";
import type { Db } from "./db";
import { ingestAll } from "./ingestion";

// Fills an empty database on startup (a fresh deploy has none) and keeps it current afterwards.
// The server does not wait for this, so health checks pass while the first download runs.
export function startDataRefresh(db: Db, hubs: readonly Hub[]): void {
  const schedule = (delayMs: number) => setTimeout(refresh, delayMs).unref();

  async function refresh() {
    try {
      const summary = await ingestAll(db, hubs);
      console.log(`Data refresh done: ${summary.weatherRowsAdded} weather rows added, FEMA refreshed: ${summary.hazardsRefreshed}`);
      schedule(API_CONFIG.refreshIntervalMs);
    } catch (error) {
      console.error("Data refresh failed, will retry:", error instanceof Error ? error.message : error);
      schedule(API_CONFIG.refreshRetryMs);
    }
  }

  void refresh();
}
