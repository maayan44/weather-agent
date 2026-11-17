import { ARCHIVE_LAG_DAYS } from "../config/dataSources";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateWindow {
  startDate: string;
  endDate: string;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * MS_PER_DAY));
}

// We keep data from Jan 1 of last year so both "last year" and "last 12 months" questions work.
export function getFirstWantedDate(today: Date): string {
  return `${today.getUTCFullYear() - 1}-01-01`;
}

export function getLastAvailableDate(today: Date): string {
  return toIsoDate(new Date(today.getTime() - ARCHIVE_LAG_DAYS * MS_PER_DAY));
}

// Returns only the days we don't have yet, or null when the cache is already current.
export function getMissingWindow(today: Date, latestCachedDate: string | null): DateWindow | null {
  const startDate = latestCachedDate ? addDays(latestCachedDate, 1) : getFirstWantedDate(today);
  const endDate = getLastAvailableDate(today);
  return startDate > endDate ? null : { startDate, endDate };
}
