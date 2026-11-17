import type { Db } from "./db";
import type { DailyWeather } from "./types";

interface WeatherRow {
  hub_id: string;
  date: string;
  snowfall_inches: number;
  precipitation_inches: number;
  wind_gust_mph: number;
  temp_max_f: number;
  temp_min_f: number;
}

export function saveDailyWeather(db: Db, rows: DailyWeather[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO daily_weather
      (hub_id, date, snowfall_inches, precipitation_inches, wind_gust_mph, temp_max_f, temp_min_f)
    VALUES (@hubId, @date, @snowfallInches, @precipitationInches, @windGustMph, @tempMaxF, @tempMinF)
  `);
  db.transaction((batch: DailyWeather[]) => batch.forEach((row) => insert.run(row)))(rows);
}

export function getLatestWeatherDate(db: Db, hubId: string): string | null {
  const row = db.prepare("SELECT MAX(date) AS latest FROM daily_weather WHERE hub_id = ?").get(hubId) as {
    latest: string | null;
  };
  return row.latest;
}

export function countStoredDays(db: Db, hubId: string, startDate: string, endDate: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS days FROM daily_weather WHERE hub_id = ? AND date BETWEEN ? AND ?")
    .get(hubId, startDate, endDate) as { days: number };
  return row.days;
}

// Both bounds are inclusive.
export function getDailyWeather(db: Db, hubId: string, startDate: string, endDate: string): DailyWeather[] {
  const rows = db
    .prepare("SELECT * FROM daily_weather WHERE hub_id = ? AND date BETWEEN ? AND ? ORDER BY date")
    .all(hubId, startDate, endDate) as WeatherRow[];

  return rows.map((row) => ({
    hubId: row.hub_id,
    date: row.date,
    snowfallInches: row.snowfall_inches,
    precipitationInches: row.precipitation_inches,
    windGustMph: row.wind_gust_mph,
    tempMaxF: row.temp_max_f,
    tempMinF: row.temp_min_f,
  }));
}
