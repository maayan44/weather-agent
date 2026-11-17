// Single source of truth for hubs. Coordinates are approximate metro centers.

export const REGIONS = [
  "Midwest",
  "Mountain",
  "South Central",
  "Gulf Coast",
  "Southeast coast",
  "Southeast",
  "Southwest",
  "West Coast",
] as const;

export type Region = (typeof REGIONS)[number];

export interface Hub {
  id: string;
  name: string;
  state: string;
  // FEMA National Risk Index is published per county, so we map each hub to one.
  county: string;
  countyFips: string;
  latitude: number;
  longitude: number;
  region: Region;
  // Why this hub is in the set; reused in explanations and docs.
  role: string;
}

export const HUBS: readonly Hub[] = [
  { id: "chicago", name: "Chicago", state: "IL", county: "Cook", countyFips: "17031", latitude: 41.8781, longitude: -87.6298, region: "Midwest", role: "Biggest freight hub in the US, a winter case" },
  { id: "minneapolis", name: "Minneapolis", state: "MN", county: "Hennepin", countyFips: "27053", latitude: 44.9778, longitude: -93.265, region: "Midwest", role: "Extreme winter" },
  { id: "detroit", name: "Detroit", state: "MI", county: "Wayne", countyFips: "26163", latitude: 42.3314, longitude: -83.0458, region: "Midwest", role: "Moderate winter, so the Midwest ranking has a middle" },
  { id: "denver", name: "Denver", state: "CO", county: "Denver", countyFips: "08031", latitude: 39.7392, longitude: -104.9903, region: "Mountain", role: "Snowfall question, plus wind" },
  { id: "dallas", name: "Dallas", state: "TX", county: "Dallas", countyFips: "48113", latitude: 32.7767, longitude: -96.797, region: "South Central", role: "Heat, storms, some winter ice" },
  { id: "houston", name: "Houston", state: "TX", county: "Harris", countyFips: "48201", latitude: 29.7604, longitude: -95.3698, region: "Gulf Coast", role: "Hurricane and flood" },
  { id: "miami", name: "Miami", state: "FL", county: "Miami-Dade", countyFips: "12086", latitude: 25.7617, longitude: -80.1918, region: "Southeast coast", role: "Hurricane" },
  { id: "atlanta", name: "Atlanta", state: "GA", county: "Fulton", countyFips: "13121", latitude: 33.749, longitude: -84.388, region: "Southeast", role: "Medium-risk inland hub" },
  { id: "phoenix", name: "Phoenix", state: "AZ", county: "Maricopa", countyFips: "04013", latitude: 33.4484, longitude: -112.074, region: "Southwest", role: "Extreme heat, almost no winter risk" },
  { id: "los-angeles", name: "Los Angeles", state: "CA", county: "Los Angeles", countyFips: "06037", latitude: 34.0522, longitude: -118.2437, region: "West Coast", role: "Low-risk control hub" },
];

// Tuple form so tool schemas can use it as an enum: the model can only name a real hub.
export const HUB_IDS = HUBS.map((hub) => hub.id) as [string, ...string[]];

export function getHub(id: string): Hub | undefined {
  return HUBS.find((hub) => hub.id === id);
}

export function requireHub(id: string): Hub {
  const hub = getHub(id);
  if (!hub) throw new Error(`Unknown hub: ${id}`);
  return hub;
}

export function getHubsByRegion(region: Region): Hub[] {
  return HUBS.filter((hub) => hub.region === region);
}
