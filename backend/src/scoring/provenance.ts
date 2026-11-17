import { AGENT_CONFIG } from "../config/agent";
import { MIN_DATA_COVERAGE, SCORING_WINDOW_DAYS, SCORING_WINDOW_YEARS, type MetricId } from "../config/scoring";
import type { HubRisk } from "./types";

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

type Window = Pick<HubRisk, "windowStart" | "windowEnd" | "daysOfData">;

// Says "3-year" only when the data really covers it; a hub still filling its cache states its true length.
function describeWindow({ windowStart, windowEnd, daysOfData }: Window): string {
  const length = daysOfData >= SCORING_WINDOW_DAYS * MIN_DATA_COVERAGE ? `${SCORING_WINDOW_YEARS}-year` : `${daysOfData}-day`;
  return `${length} window, ${windowStart} to ${windowEnd}`;
}

export function scoreProvenance(risk: Window): Provenance {
  return { source: SOURCES.engine, data_period: `average over the ${describeWindow(risk)}` };
}

export function metricProvenance(id: MetricId, risk: Window): Provenance {
  return FEMA_METRICS.has(id)
    ? { source: SOURCES.fema, data_period: "long-run yearly frequency" }
    : { source: SOURCES.weather, data_period: `per-year average over the ${describeWindow(risk)}` };
}

export function periodProvenance(startDate: string, endDate: string): Provenance {
  return { source: SOURCES.weather, data_period: `${startDate} to ${endDate}` };
}

function ownProvenance(node: Record<string, unknown>): Provenance | null {
  return typeof node.source === "string" && typeof node.data_period === "string"
    ? { source: node.source, data_period: node.data_period }
    : null;
}

// "inches per year" and "in/yr" are the same unit; the model often writes units out in words.
// Every way of writing a 0-100 score ("points out of 100", "score (0-100)") becomes "score".
// A note in brackets ("days (3.8% of 184 days)") is not part of the unit.
function normalizeUnit(unit: string): string {
  const text = unit.toLowerCase().replace(/\(.*?\)/g, "");
  if (/score|point|\/ ?100|out of 100/.test(text)) return "score";
  return text
    .replace(/per year|a year|\/ ?year/g, "/yr")
    .replace(/\binch(es)?\b/g, "in")
    .replace(/\s+/g, "");
}

// The unit of the number stored under `key`. Only a measurement's own value takes the `unit` written beside it:
// a score next to it ({ value: 20.3, unit: "days/yr", score: 45 }) is a 0-100 score, not 45 days a year.
function unitOf(key: string, statedUnit: string | null): string | null {
  if ((key === "value" || key === "rawValue") && statedUnit) return normalizeUnit(statedUnit);
  if (/score/i.test(key)) return "score";
  // The stats tools name their units in the field: totalSnowfallInches, daysMatching.
  if (/inches$/i.test(key)) return "in";
  if (key === "percentage") return "%";
  if (/^days|days$/i.test(key)) return "days";
  return null;
}

interface Match {
  provenance: Provenance | null;
  unit: string | null;
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
        if (Math.abs(item - value) < AGENT_CONFIG.numberTolerance) found.push({ provenance: here, unit: unitOf(key, statedUnit) });
      } else {
        collectMatches(value, item, here, found);
      }
    }
  }
}

function agreedProvenance(matches: Match[]): Provenance | null {
  const first = matches[0]?.provenance;
  if (!first) return null;
  const allAgree = matches.every(
    ({ provenance }) => provenance !== null && provenance.source === first.source && provenance.data_period === first.data_period,
  );
  return allAgree ? first : null;
}

// The provenance of a figure: the places its value appears with the same unit, if they all agree. A figure whose
// unit matches nothing gets no label, so a number the model mislabelled (a score written as "days/yr") is never
// made to look sourced. A missing label is better than a wrong one.
export function findProvenance(value: number, unit: string, toolOutputs: unknown[]): Provenance | null {
  const found: Match[] = [];
  toolOutputs.forEach((output) => collectMatches(value, output, null, found));
  const wanted = normalizeUnit(unit);
  // A figure with no unit at all can only be labelled when every place it appears agrees.
  if (wanted === "") return agreedProvenance(found);
  return agreedProvenance(found.filter((match) => match.unit === wanted));
}
