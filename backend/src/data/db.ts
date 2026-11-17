import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

// The DB is a rebuildable cache, so it is safe to recreate it after a redeploy.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS daily_weather (
    hub_id TEXT NOT NULL,
    date TEXT NOT NULL,
    snowfall_inches REAL NOT NULL,
    precipitation_inches REAL NOT NULL,
    wind_gust_mph REAL NOT NULL,
    temp_max_f REAL NOT NULL,
    temp_min_f REAL NOT NULL,
    PRIMARY KEY (hub_id, date)
  );

  CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    user_message TEXT NOT NULL,
    answer_json TEXT NOT NULL,
    tools_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_turns_conversation ON conversation_turns (conversation_id, id);

  CREATE TABLE IF NOT EXISTS hub_hazards (
    hub_id TEXT PRIMARY KEY,
    hurricane_annual_frequency REAL NOT NULL,
    coastal_flood_annual_frequency REAL NOT NULL,
    inland_flood_annual_frequency REAL NOT NULL,
    fetched_at TEXT NOT NULL
  );
`;

// A database made before a column existed (e.g. on the Railway volume) gets it added, keeping its rows.
function addMissingColumns(db: Db): void {
  const columns = db.prepare("PRAGMA table_info(conversation_turns)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "tools_json")) {
    db.exec("ALTER TABLE conversation_turns ADD COLUMN tools_json TEXT NOT NULL DEFAULT '[]'");
  }
}

export function openDatabase(filePath: string): Db {
  if (filePath !== ":memory:") fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  addMissingColumns(db);
  return db;
}
