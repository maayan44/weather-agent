import type { Db } from "./db";
import type { HubHazards } from "./types";

interface HazardRow {
  hub_id: string;
  hurricane_annual_frequency: number;
  coastal_flood_annual_frequency: number;
  inland_flood_annual_frequency: number;
  fetched_at: string;
}

export function saveHubHazards(db: Db, hazards: HubHazards[], fetchedAt: Date): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO hub_hazards
      (hub_id, hurricane_annual_frequency, coastal_flood_annual_frequency, inland_flood_annual_frequency, fetched_at)
    VALUES (@hubId, @hurricaneAnnualFrequency, @coastalFloodAnnualFrequency, @inlandFloodAnnualFrequency, @fetchedAt)
  `);
  db.transaction((batch: HubHazards[]) =>
    batch.forEach((hazard) => insert.run({ ...hazard, fetchedAt: fetchedAt.toISOString() })),
  )(hazards);
}

export function getHubHazards(db: Db, hubId: string): HubHazards | null {
  const row = db.prepare("SELECT * FROM hub_hazards WHERE hub_id = ?").get(hubId) as HazardRow | undefined;
  if (!row) return null;
  return {
    hubId: row.hub_id,
    hurricaneAnnualFrequency: row.hurricane_annual_frequency,
    coastalFloodAnnualFrequency: row.coastal_flood_annual_frequency,
    inlandFloodAnnualFrequency: row.inland_flood_annual_frequency,
  };
}

export function getHazardsFetchedAt(db: Db): Date | null {
  const row = db.prepare("SELECT MIN(fetched_at) AS oldest FROM hub_hazards").get() as { oldest: string | null };
  return row.oldest ? new Date(row.oldest) : null;
}
