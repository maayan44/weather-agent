import { HAZARDS, MIN_DATA_COVERAGE, SCORING_WINDOW_DAYS, type Hazard } from "../config/scoring";
import { addDays } from "../data/dateRange";
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
// No hazard at all (every score 0) is "none", not an arbitrary first hazard.
function findDominantHazard(subScores: Record<Hazard, SubScore>): Hazard | null {
  const top = HAZARDS.reduce((best, hazard) => (subScores[hazard].score > subScores[best].score ? hazard : best));
  return subScores[top].score > 0 ? top : null;
}

const SEASONS: { name: string; months: number[] }[] = [
  { name: "Winter", months: [12, 1, 2] },
  { name: "Spring", months: [3, 4, 5] },
  { name: "Summer", months: [6, 7, 8] },
  { name: "Autumn", months: [9, 10, 11] },
];

const monthOf = (isoDate: string) => Number(isoDate.slice(5, 7));

// Per-year averages assume missing days are spread over the year. If they bunch up in one season, that season's
// hazards read low even when total coverage looks fine, so say so instead of hiding it.
function findSeasonGaps(dates: string[], windowEnd: string): string[] {
  const windowStart = addDays(windowEnd, -(SCORING_WINDOW_DAYS - 1));
  const have = new Set(dates);
  const counts = SEASONS.map(() => ({ expected: 0, missing: 0 }));
  for (let day = windowStart; day <= windowEnd; day = addDays(day, 1)) {
    const season = counts[SEASONS.findIndex(({ months }) => months.includes(monthOf(day)))];
    season.expected++;
    if (!have.has(day)) season.missing++;
  }
  return SEASONS.flatMap(({ name }, index) => {
    const { expected, missing } = counts[index];
    return expected - missing < expected * MIN_DATA_COVERAGE
      ? [`${name} is missing ${missing} of ${expected} days of weather data, so ${name.toLowerCase()} hazards may read lower than they are.`]
      : [];
  });
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
  } else {
    dataGaps.push(...findSeasonGaps(dates, dates[dates.length - 1]));
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
