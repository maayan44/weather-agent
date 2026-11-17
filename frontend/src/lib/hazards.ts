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

export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
