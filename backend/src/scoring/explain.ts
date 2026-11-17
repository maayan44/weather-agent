import { HAZARDS, type Hazard } from "../config/scoring";
import { roundScore } from "./normalize";
import type { HubRisk } from "./types";

export interface Contribution {
  hazard: Hazard;
  metric: string;
  rawValue: number;
  unit: string;
  // How many of the composite's points this metric adds; all contributions sum to the composite.
  points: number;
}

// Answers "why is this hub's score what it is" straight from the formula, without the LLM guessing.
export function explainHubRisk(risk: HubRisk, topCount = 5): Contribution[] {
  return HAZARDS.flatMap((hazard) => {
    const subScore = risk.subScores[hazard];
    return subScore.metrics.map((metric) => ({
      hazard,
      metric: metric.label,
      rawValue: metric.rawValue,
      unit: metric.unit,
      points: roundScore(metric.score * metric.weight * subScore.weight),
    }));
  })
    .sort((a, b) => b.points - a.points || a.metric.localeCompare(b.metric))
    .slice(0, topCount);
}
