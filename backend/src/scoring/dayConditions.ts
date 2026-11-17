import { DAY_THRESHOLDS, MEASURABLE_RAIN_INCHES, SNOWFALL_DAY_MIN_INCHES } from "../config/scoring";
import type { DailyWeather } from "../data/types";

export const DAY_CONDITION_IDS = [
  "snowfall",
  "heavy_snow",
  "rain",
  "heavy_rain",
  "freezing",
  "hot",
  "extreme_heat",
  "strong_gust",
  "severe_gust",
] as const;

export type DayConditionId = (typeof DAY_CONDITION_IDS)[number];

interface DayCondition {
  label: string; // shown to the user so the definition is never hidden
  matches: (day: DailyWeather) => boolean;
}

// The one place a "day with X" is defined, shared by the risk score and the weather-stats tool.
export const DAY_CONDITIONS: Record<DayConditionId, DayCondition> = {
  snowfall: { label: `snowfall of ${SNOWFALL_DAY_MIN_INCHES} in or more`, matches: (day) => day.snowfallInches >= SNOWFALL_DAY_MIN_INCHES },
  heavy_snow: { label: `snowfall of ${DAY_THRESHOLDS.snowDayInches} in or more`, matches: (day) => day.snowfallInches >= DAY_THRESHOLDS.snowDayInches },
  rain: { label: `rain of ${MEASURABLE_RAIN_INCHES} in or more`, matches: (day) => day.precipitationInches >= MEASURABLE_RAIN_INCHES },
  heavy_rain: { label: `rain of ${DAY_THRESHOLDS.heavyRainInches} in or more`, matches: (day) => day.precipitationInches >= DAY_THRESHOLDS.heavyRainInches },
  freezing: { label: `max temperature at or below ${DAY_THRESHOLDS.freezingMaxTempF}°F`, matches: (day) => day.tempMaxF <= DAY_THRESHOLDS.freezingMaxTempF },
  hot: { label: `max temperature at or above ${DAY_THRESHOLDS.hotMaxTempF}°F`, matches: (day) => day.tempMaxF >= DAY_THRESHOLDS.hotMaxTempF },
  extreme_heat: { label: `max temperature at or above ${DAY_THRESHOLDS.extremeHotMaxTempF}°F`, matches: (day) => day.tempMaxF >= DAY_THRESHOLDS.extremeHotMaxTempF },
  strong_gust: { label: `wind gusts of ${DAY_THRESHOLDS.gustMph} mph or more`, matches: (day) => day.windGustMph >= DAY_THRESHOLDS.gustMph },
  severe_gust: { label: `wind gusts of ${DAY_THRESHOLDS.severeGustMph} mph or more`, matches: (day) => day.windGustMph >= DAY_THRESHOLDS.severeGustMph },
};

export function countDays(weather: DailyWeather[], condition: DayConditionId): number {
  return weather.filter(DAY_CONDITIONS[condition].matches).length;
}
