import { HAZARDS, MIN_DATA_COVERAGE, SCORING_WINDOW_DAYS, type Hazard } from "../config/scoring";
import type { Hub } from "../config/hubs";
import { roundScore } from "./normalize";
import { computeSubScore } from "./subScores";
import type { HubRisk, ScoringInput, SubScore } from "./types";

function roundSubScore(subScore: SubScore): SubScore {
  return {
    ...subScore,
    score: roundScore(subScore.score),
    metrics: subScore.metrics.map((metric) => ({ ...metric, score: roundScore(metric.score) })),
  };
}

// First hazard with the highest score wins ties, in the fixed HAZARDS order.
function findDominantHazard(subScores: Record<Hazard, SubScore>): Hazard {
  return HAZARDS.reduce((top, hazard) => (subScores[hazard].score > subScores[top].score ? hazard : top));
}

// Pure function: same input always gives the same output, with no clock, network or LLM involved.
export function computeHubRisk(hub: Hub, input: ScoringInput): HubRisk {
  if (input.weather.length === 0) throw new Error(`No weather data for ${hub.name}`);

  const rawSubScores = Object.fromEntries(HAZARDS.map((hazard) => [hazard, computeSubScore(hazard, input)])) as Record<
    Hazard,
    SubScore
  >;

  // Round only at the end so rounding never changes the ranking.
  const compositeScore = HAZARDS.reduce((total, hazard) => total + rawSubScores[hazard].score * rawSubScores[hazard].weight, 0);

  const dates = input.weather.map((day) => day.date).sort();
  const daysOfData = input.weather.length;
  const dataGaps: string[] = [];
  if (daysOfData < SCORING_WINDOW_DAYS * MIN_DATA_COVERAGE) {
    dataGaps.push(`Only ${daysOfData} of ${SCORING_WINDOW_DAYS} days of weather data were available.`);
  }

  return {
    hubId: hub.id,
    hubName: hub.name,
    region: hub.region,
    compositeScore: roundScore(compositeScore),
    dominantHazard: findDominantHazard(rawSubScores),
    subScores: Object.fromEntries(HAZARDS.map((hazard) => [hazard, roundSubScore(rawSubScores[hazard])])) as Record<
      Hazard,
      SubScore
    >,
    windowStart: dates[0],
    windowEnd: dates[dates.length - 1],
    daysOfData,
    dataGaps,
  };
}
