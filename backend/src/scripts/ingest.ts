import "dotenv/config";
import { HUBS } from "../config/hubs";
import { openDatabase } from "../data/db";
import { ingestAll } from "../data/ingestion";

// Run with `npm run ingest` to fill or refresh the cache by hand.
async function main() {
  const db = openDatabase(process.env.DB_PATH ?? "./data/weather.db");
  const summary = await ingestAll(db, HUBS);
  console.log(`Saved ${summary.weatherRowsSaved} weather rows. FEMA: ${summary.hazardsSource}`);
  if (summary.failures.length > 0) {
    console.error(`Failures:\n  ${summary.failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
