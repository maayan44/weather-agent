import type { RankingEntry } from "@/api/types";
import { formatScore, metricLabel } from "./hazards";

// Bands for a single hazard score (0-100). They exist because the overall score averages five hazards:
// a hub can look moderate overall (Chicago is 36) while one hazard is serious (its wind is 79).
export const HIGH_FROM = 50;
export const MODERATE_FROM = 25;

export type ExposureLevel = "high" | "moderate" | "low";

export const EXPOSURE_LABEL: Record<ExposureLevel, string> = { high: "High", moderate: "Moderate", low: "Low" };

export const EXPOSURE_LEGEND = `High ${HIGH_FROM}+ · Moderate ${MODERATE_FROM}-${HIGH_FROM - 1} · Low under ${MODERATE_FROM}`;

export function exposureLevel(score: number): ExposureLevel {
  if (score >= HIGH_FROM) return "high";
  if (score >= MODERATE_FROM) return "moderate";
  return "low";
}

// The hazards that are high even though the overall score is not: exactly the risk the overall score hides.
export function hiddenRisks(entries: RankingEntry[]): RankingEntry[] {
  const overall = entries.find((entry) => entry.metric === "composite");
  if (!overall || exposureLevel(overall.score) === "high") return [];
  return entries.filter((entry) => entry.metric !== "composite" && exposureLevel(entry.score) === "high");
}

export function describeHiddenRisks(entries: RankingEntry[]): string | null {
  const hidden = hiddenRisks(entries).map((entry) => `${metricLabel(entry.metric)} (${formatScore(entry.score)})`);
  if (hidden.length === 0) return null;
  const list = hidden.length === 1 ? hidden[0] : `${hidden.slice(0, -1).join(", ")} and ${hidden[hidden.length - 1]}`;
  return `The overall score averages five hazards, so it understates ${list}.`;
}
