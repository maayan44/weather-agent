import { addDays, daysInclusive } from "../data/dateRange";
import type { DailyWeather } from "../data/types";
import { DAY_CONDITIONS, countDays, type DayConditionId } from "./dayConditions";

export const STATS_PERIODS = ["last_calendar_year", "last_12_months", "year_to_date", "last_winter"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export interface DateSpan {
  startDate: string;
  endDate: string;
}

// How complete the data is for the requested period, so a partial answer is never presented as a full one.
export interface Coverage {
  daysInPeriod: number;
  daysWithData: number;
  missingDays: number;
  coverage: "complete" | "partial" | "none";
}

export interface PercentOfDays extends DateSpan, Coverage {
  condition: DayConditionId;
  definition: string;
  period: StatsPeriod;
  daysMatching: number;
  percentage: number;
}

export interface SnowfallTotal extends DateSpan, Coverage {
  period: StatsPeriod;
  totalSnowfallInches: number;
  snowDays: number;
  snowDayDefinition: string;
}

// Calendar periods follow today's date, as the user means them. Only the rolling 12 months follows the
// newest stored day, so it always covers a full year of data. Both dates are YYYY-MM-DD.
export function resolvePeriod(period: StatsPeriod, today: string, latestDate: string): DateSpan {
  const year = Number(today.slice(0, 4));
  switch (period) {
    case "last_calendar_year":
      return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
    case "year_to_date":
      return { startDate: `${year}-01-01`, endDate: today };
    case "last_12_months":
      return { startDate: addDays(latestDate, -364), endDate: latestDate };
    case "last_winter": {
      // Winter is Dec 1 to the end of Feb; "last" means the most recent one that has finished.
      const winterEndYear = today >= `${year}-03-01` ? year : year - 1;
      const lastDayOfFeb = new Date(Date.UTC(winterEndYear, 2, 0)).getUTCDate();
      return { startDate: `${winterEndYear - 1}-12-01`, endDate: `${winterEndYear}-02-${lastDayOfFeb}` };
    }
  }
}

export function describeCoverage(weather: DailyWeather[], span: DateSpan): Coverage {
  const daysInPeriod = daysInclusive(span.startDate, span.endDate);
  const daysWithData = weather.length;
  const missingDays = Math.max(0, daysInPeriod - daysWithData);
  return {
    daysInPeriod,
    daysWithData,
    missingDays,
    coverage: daysWithData === 0 ? "none" : missingDays === 0 ? "complete" : "partial",
  };
}

// Days with no data add nothing to the total, so coverage is returned with it.
export function computeSnowfallTotal(weather: DailyWeather[], period: StatsPeriod, span: DateSpan): SnowfallTotal {
  const totalSnowfall = weather.reduce((total, day) => total + day.snowfallInches, 0);
  return {
    period,
    ...span,
    ...describeCoverage(weather, span),
    totalSnowfallInches: Math.round(totalSnowfall * 10) / 10,
    snowDays: countDays(weather, "snowfall"),
    snowDayDefinition: DAY_CONDITIONS.snowfall.label,
  };
}

// The percentage uses the days we actually have; coverage says how many that is.
export function computePercentOfDays(
  weather: DailyWeather[],
  condition: DayConditionId,
  period: StatsPeriod,
  span: DateSpan,
): PercentOfDays {
  const daysMatching = countDays(weather, condition);
  const coverage = describeCoverage(weather, span);
  return {
    condition,
    definition: DAY_CONDITIONS[condition].label,
    period,
    ...span,
    ...coverage,
    daysMatching,
    percentage: coverage.daysWithData === 0 ? 0 : Math.round((daysMatching / coverage.daysWithData) * 1000) / 10,
  };
}
