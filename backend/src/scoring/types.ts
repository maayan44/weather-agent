import type { Hazard, MetricId } from "../config/scoring";
import type { DailyWeather, HubHazards } from "../data/types";

// Everything the scoring needs for one hub, already read from the cache.
export interface ScoringInput {
  weather: DailyWeather[];
  hazards: HubHazards;
}

// One line of the explanation: what was measured, and how it became a score.
export interface MetricResult {
  id: MetricId;
  label: string;
  unit: string;
  rawValue: number;
  score: number;
  weight: number;
}

export interface SubScore {
  hazard: Hazard;
  score: number;
  weight: number;
  metrics: MetricResult[];
}

export interface HubRisk {
  hubId: string;
  hubName: string;
  region: string;
  compositeScore: number;
  dominantHazard: Hazard | null;
  subScores: Record<Hazard, SubScore>;
  windowStart: string;
  windowEnd: string;
  daysOfData: number;
  // Honest caveats about this specific result, passed on to the user.
  dataGaps: string[];
}

export type RankingKey = Hazard | "composite";

export interface RankedHub {
  rank: number;
  score: number;
  risk: HubRisk;
}
