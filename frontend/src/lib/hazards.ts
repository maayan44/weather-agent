import { CloudLightning, Snowflake, ThermometerSun, Waves, Wind, type LucideIcon } from "lucide-react";
import type { Hazard, ScoreMetric } from "@/api/types";

export const HAZARD_LABEL: Record<Hazard, string> = {
  winter: "Winter",
  flood: "Flood",
  hurricane: "Hurricane",
  heat: "Heat",
  wind: "Wind",
};

export const HAZARD_ICON: Record<Hazard, LucideIcon> = {
  winter: Snowflake,
  flood: Waves,
  hurricane: CloudLightning,
  heat: ThermometerSun,
  wind: Wind,
};

export function metricLabel(metric: ScoreMetric): string {
  return metric === "composite" ? "Overall" : HAZARD_LABEL[metric];
}

// The backend sends hub ids like "los-angeles"; the ten hub names are exactly these ids in title case.
export function hubLabel(hubId: string): string {
  return hubId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const SINGULAR_UNITS: [RegExp, string][] = [
  [/\bdays\b/g, "day"],
  [/\bevents\b/g, "event"],
  [/\binches\b/g, "inch"],
  [/\bhours\b/g, "hour"],
];

// "1 days" reads as a mistake. A value of exactly 1 gets the singular unit; everything else is left as written.
export function formatUnit(value: number, unit: string): string {
  if (value !== 1) return unit;
  return SINGULAR_UNITS.reduce((text, [plural, singular]) => text.replace(plural, singular), unit);
}

export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
