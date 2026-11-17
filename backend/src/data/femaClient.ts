import { z } from "zod";
import { FEMA_NRI_COUNTIES_URL } from "../config/dataSources";
import type { Hub } from "../config/hubs";
import { fetchJson } from "./httpJson";
import type { HubHazards } from "./types";

// Frequency, not FEMA's risk score: the score is weighted by property value, so every big county
// looks "very high" and hubs can't be told apart. Frequency measures the hazard itself.
const FEMA_FIELDS = ["STCOFIPS", "HRCN_AFREQ", "CFLD_AFREQ", "IFLD_AFREQ"];

const frequency = z.number().nullable();

const femaResponseSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        STCOFIPS: z.string(),
        HRCN_AFREQ: frequency,
        CFLD_AFREQ: frequency,
        IFLD_AFREQ: frequency,
      }),
    }),
  ),
});

export function buildFemaUrl(hubs: readonly Hub[]): string {
  const fipsList = hubs.map((hub) => `'${hub.countyFips}'`).join(",");
  const params = new URLSearchParams({
    where: `STCOFIPS IN (${fipsList})`,
    outFields: FEMA_FIELDS.join(","),
    returnGeometry: "false",
    f: "json",
  });
  return `${FEMA_NRI_COUNTIES_URL}?${params}`;
}

// A null from FEMA means "not applicable" (e.g. hurricanes in Denver), stored as 0 events per year.
export function parseFemaResponse(hubs: readonly Hub[], raw: unknown): HubHazards[] {
  const { features } = femaResponseSchema.parse(raw);
  const byFips = new Map(features.map((feature) => [feature.attributes.STCOFIPS, feature.attributes]));

  return hubs.map((hub) => {
    const county = byFips.get(hub.countyFips);
    if (!county) throw new Error(`FEMA returned no data for ${hub.name} (${hub.countyFips})`);
    return {
      hubId: hub.id,
      hurricaneAnnualFrequency: county.HRCN_AFREQ ?? 0,
      coastalFloodAnnualFrequency: county.CFLD_AFREQ ?? 0,
      inlandFloodAnnualFrequency: county.IFLD_AFREQ ?? 0,
    };
  });
}

export async function fetchHubHazards(hubs: readonly Hub[]): Promise<HubHazards[]> {
  return parseFemaResponse(hubs, await fetchJson(buildFemaUrl(hubs)));
}
