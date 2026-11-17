import "dotenv/config";
import { createModelCaller } from "./agent/llmClient";
import { createApp } from "./app";
import { HUBS } from "./config/hubs";
import { openDatabase } from "./data/db";
import { startDataRefresh } from "./data/refresh";
import { createShutdown } from "./shutdown";

const port = Number(process.env.PORT ?? 3000);
const db = openDatabase(process.env.DB_PATH ?? "./data/weather.db");

if (!process.env.ANTHROPIC_API_KEY) console.warn("ANTHROPIC_API_KEY is not set: /chat will fail until it is.");

const server = createApp({ db, callModel: createModelCaller() }).listen(port, () => {
  console.log(`API listening on port ${port}`);
  startDataRefresh(db, HUBS);
});

const shutdown = createShutdown({ server, db, exit: (code) => process.exit(code) });
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
