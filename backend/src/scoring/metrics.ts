import type { MetricId } from "../config/scoring";
import { countDays } from "./dayConditions";
import type { ScoringInput } from "./types";

// Raw, unscored measurements. The record type forces a rule for every metric in the config.
export const METRIC_EXTRACTORS: Record<MetricId, (input: ScoringInput) => number> = {
  snowDays: ({ weather }) => countDays(weather, "heavy_snow"),
  totalSnowfall: ({ weather }) => weather.reduce((total, day) => total + day.snowfallInches, 0),
  freezingDays: ({ weather }) => countDays(weather, "freezing"),
  inlandFloodFrequency: ({ hazards }) => hazards.inlandFloodAnnualFrequency,
  coastalFloodFrequency: ({ hazards }) => hazards.coastalFloodAnnualFrequency,
  heavyRainDays: ({ weather }) => countDays(weather, "heavy_rain"),
  hurricaneFrequency: ({ hazards }) => hazards.hurricaneAnnualFrequency,
  hotDays: ({ weather }) => countDays(weather, "hot"),
  extremeHotDays: ({ weather }) => countDays(weather, "extreme_heat"),
  gustDays: ({ weather }) => countDays(weather, "strong_gust"),
  severeGustDays: ({ weather }) => countDays(weather, "severe_gust"),
};
