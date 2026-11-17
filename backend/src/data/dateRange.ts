import { ARCHIVE_LAG_DAYS, RECENT_REFETCH_DAYS } from "../config/dataSources";
import { SCORING_WINDOW_DAYS } from "../config/scoring";

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

// Both ends count: Jan 1 to Jan 3 is 3 days.
export function daysInclusive(startDate: string, endDate: string): number {
  if (endDate < startDate) return 0;
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / MS_PER_DAY) + 1;
}

export function getLastAvailableDate(today: Date): string {
  return toIsoDate(new Date(today.getTime() - ARCHIVE_LAG_DAYS * MS_PER_DAY));
}

// The 3-year scoring window also covers "last calendar year", "last 12 months" and "last winter".
export function getFirstWantedDate(today: Date): string {
  return addDays(getLastAvailableDate(today), -(SCORING_WINDOW_DAYS - 1));
}

export function getWantedRange(today: Date): DateWindow {
  return { startDate: getFirstWantedDate(today), endDate: getLastAvailableDate(today) };
}

// If any day in the wanted range is missing, fetch the whole range (one request per hub, so cheap).
// Otherwise fetch only the newest days: the archive corrects recent values for a few days after publishing.
export function getFetchWindow(wanted: DateWindow, storedDays: number): DateWindow {
  if (storedDays < daysInclusive(wanted.startDate, wanted.endDate)) return wanted;
  const recentStart = addDays(wanted.endDate, -(RECENT_REFETCH_DAYS - 1));
  return { startDate: recentStart > wanted.startDate ? recentStart : wanted.startDate, endDate: wanted.endDate };
}
