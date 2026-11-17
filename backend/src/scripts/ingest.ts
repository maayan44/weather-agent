import "dotenv/config";
import { HUBS } from "../config/hubs";
import { openDatabase } from "../data/db";
import { ingestAll } from "../data/ingestion";

// Run with `npm run ingest` to fill or refresh the cache by hand.
async function main() {
  const db = openDatabase(process.env.DB_PATH ?? "./data/weather.db");
  const summary = await ingestAll(db, HUBS);
  console.log(`Added ${summary.weatherRowsAdded} weather rows. FEMA refreshed: ${summary.hazardsRefreshed}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
