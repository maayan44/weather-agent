import { addDays } from "../data/dateRange";
import type { DailyWeather } from "../data/types";
import { DAY_CONDITIONS, countDays, type DayConditionId } from "./dayConditions";

export const STATS_PERIODS = ["last_calendar_year", "last_12_months", "year_to_date", "last_winter"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export interface DateSpan {
  startDate: string;
  endDate: string;
}

export interface PercentOfDays {
  condition: DayConditionId;
  definition: string;
  period: StatsPeriod;
  startDate: string;
  endDate: string;
  daysWithData: number;
  daysMatching: number;
  percentage: number;
}

// Periods are anchored on the newest cached day, not the clock, so answers match the data we hold.
export function resolvePeriod(period: StatsPeriod, latestDate: string): DateSpan {
  const year = Number(latestDate.slice(0, 4));
  switch (period) {
    case "last_calendar_year":
      return { startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` };
    case "year_to_date":
      return { startDate: `${year}-01-01`, endDate: latestDate };
    case "last_12_months":
      return { startDate: addDays(latestDate, -364), endDate: latestDate };
    case "last_winter": {
      // Winter is Dec 1 to the end of Feb; "last" means the most recent one that has finished.
      const winterEndYear = latestDate >= `${year}-03-01` ? year : year - 1;
      const lastDayOfFeb = new Date(Date.UTC(winterEndYear, 2, 0)).getUTCDate();
      return { startDate: `${winterEndYear - 1}-12-01`, endDate: `${winterEndYear}-02-${lastDayOfFeb}` };
    }
  }
}

export interface SnowfallTotal {
  period: StatsPeriod;
  startDate: string;
  endDate: string;
  daysWithData: number;
  totalSnowfallInches: number;
  snowDays: number;
  snowDayDefinition: string;
}

// Days with no data add nothing to the total, so daysWithData is returned to show how complete it is.
export function computeSnowfallTotal(weather: DailyWeather[], period: StatsPeriod, span: DateSpan): SnowfallTotal {
  const totalSnowfall = weather.reduce((total, day) => total + day.snowfallInches, 0);
  return {
    period,
    ...span,
    daysWithData: weather.length,
    totalSnowfallInches: Math.round(totalSnowfall * 10) / 10,
    snowDays: countDays(weather, "snowfall"),
    snowDayDefinition: DAY_CONDITIONS.snowfall.label,
  };
}

// The percentage uses days we actually have, and the count is returned so gaps stay visible.
export function computePercentOfDays(
  weather: DailyWeather[],
  condition: DayConditionId,
  period: StatsPeriod,
  span: DateSpan,
): PercentOfDays {
  const daysMatching = countDays(weather, condition);
  const daysWithData = weather.length;
  return {
    condition,
    definition: DAY_CONDITIONS[condition].label,
    period,
    ...span,
    daysWithData,
    daysMatching,
    percentage: daysWithData === 0 ? 0 : Math.round((daysMatching / daysWithData) * 1000) / 10,
  };
}
