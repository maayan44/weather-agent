import { DAYS_PER_YEAR, type MetricId } from "../config/scoring";
import { countDays, type DayConditionId } from "./dayConditions";
import type { ScoringInput } from "./types";

// Averaged to a per-year figure over the days actually available, so a gap spread over the year does not look
// like a calmer climate. A gap bunched in one season would still read low; hubRisk flags that as a data gap.
function perYear(total: number, { weather }: ScoringInput): number {
  return (total * DAYS_PER_YEAR) / weather.length;
}

const daysPerYear = (condition: DayConditionId) => (input: ScoringInput) => perYear(countDays(input.weather, condition), input);

// Raw, unscored measurements. The record type forces a rule for every metric in the config.
export const METRIC_EXTRACTORS: Record<MetricId, (input: ScoringInput) => number> = {
  snowDays: daysPerYear("heavy_snow"),
  totalSnowfall: (input) => perYear(input.weather.reduce((total, day) => total + day.snowfallInches, 0), input),
  freezingDays: daysPerYear("freezing"),
  inlandFloodFrequency: ({ hazards }) => hazards.inlandFloodAnnualFrequency,
  coastalFloodFrequency: ({ hazards }) => hazards.coastalFloodAnnualFrequency,
  heavyRainDays: daysPerYear("heavy_rain"),
  hurricaneFrequency: ({ hazards }) => hazards.hurricaneAnnualFrequency,
  hotDays: daysPerYear("hot"),
  extremeHotDays: daysPerYear("extreme_heat"),
  gustDays: daysPerYear("strong_gust"),
  severeGustDays: daysPerYear("severe_gust"),
};
