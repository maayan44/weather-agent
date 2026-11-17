import type { MetricId } from "../config/scoring";

// Where a number comes from and what time it covers. Tool results carry these next to their numbers, and code
// copies them onto each figure of the answer, so the reader sees them without the model writing them.
export interface Provenance {
  source: string;
  data_period: string;
}

export const SOURCES = {
  weather: "Open-Meteo weather archive",
  fema: "FEMA National Risk Index",
  engine: "WeatherHub scoring engine (Open-Meteo + FEMA)",
};

const FEMA_METRICS: ReadonlySet<MetricId> = new Set(["inlandFloodFrequency", "coastalFloodFrequency", "hurricaneFrequency"]);

// Matches the rounding tolerance the answer check uses for figures.
const TOLERANCE = 0.051;

export function scoreProvenance(windowStart: string, windowEnd: string): Provenance {
  return { source: SOURCES.engine, data_period: `3-year average, ${windowStart} to ${windowEnd}` };
}

export function metricProvenance(id: MetricId, windowStart: string, windowEnd: string): Provenance {
  return FEMA_METRICS.has(id)
    ? { source: SOURCES.fema, data_period: "long-run yearly frequency" }
    : { source: SOURCES.weather, data_period: `per-year average, ${windowStart} to ${windowEnd}` };
}

export function periodProvenance(startDate: string, endDate: string): Provenance {
  return { source: SOURCES.weather, data_period: `${startDate} to ${endDate}` };
}

function ownProvenance(node: Record<string, unknown>): Provenance | null {
  return typeof node.source === "string" && typeof node.data_period === "string"
    ? { source: node.source, data_period: node.data_period }
    : null;
}

interface Match {
  provenance: Provenance | null;
  // The unit stated next to the number, when there is one ("days/yr", "events/yr").
  unit: string | null;
}

// The stats tools name their units in the field instead of a `unit` next to it: totalSnowfallInches, daysMatching.
function unitFromKey(key: string): string | null {
  if (/inches$/i.test(key)) return "in";
  if (key === "percentage") return "%";
  if (/^days|days$/i.test(key)) return "days";
  return null;
}

// Every place the value appears, each with the provenance of the nearest enclosing object that states one.
function collectMatches(value: number, node: unknown, inherited: Provenance | null, found: Match[]): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectMatches(value, item, inherited, found));
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    const here = ownProvenance(record) ?? inherited;
    const statedUnit = typeof record.unit === "string" ? record.unit : null;
    for (const [key, item] of Object.entries(record)) {
      if (typeof item === "number") {
        if (Math.abs(item - value) < TOLERANCE) found.push({ provenance: here, unit: statedUnit ?? unitFromKey(key) });
      } else {
        collectMatches(value, item, here, found);
      }
    }
  }
}

// "inches per year" and "in/yr" are the same unit; the model often writes units out in words.
function normalizeUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/per year|a year|\/ ?year/g, "/yr")
    .replace(/\binch(es)?\b/g, "in")
    .replace(/\s+/g, "");
}

function agreedProvenance(matches: Match[]): Provenance | null {
  const first = matches[0]?.provenance;
  if (!first) return null;
  const allAgree = matches.every(
    ({ provenance }) => provenance !== null && provenance.source === first.source && provenance.data_period === first.data_period,
  );
  return allAgree ? first : null;
}

// The provenance of a figure's value, or null when it is unknown or ambiguous. When the same number appears in
// places with different sources (a rank of 3 and 3 gust days), the unit decides; if it cannot, no label is
// given, because a missing label is better than a wrong one.
export function findProvenance(value: number, unit: string, toolOutputs: unknown[]): Provenance | null {
  const found: Match[] = [];
  toolOutputs.forEach((output) => collectMatches(value, output, null, found));
  const sameUnit = found.filter((match) => match.unit !== null && normalizeUnit(match.unit) === normalizeUnit(unit));
  return agreedProvenance(found) ?? agreedProvenance(sameUnit);
}
