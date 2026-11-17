import { z } from "zod";
import { OPEN_METEO_ARCHIVE_URL } from "../config/dataSources";
import type { Hub } from "../config/hubs";
import type { DateWindow } from "./dateRange";
import { fetchJson } from "./httpJson";
import type { DailyWeather } from "./types";

const numberOrNull = z.array(z.number().nullable());

const archiveResponseSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    snowfall_sum: numberOrNull,
    precipitation_sum: numberOrNull,
    wind_gusts_10m_max: numberOrNull,
    temperature_2m_max: numberOrNull,
    temperature_2m_min: numberOrNull,
  }),
});

export function buildArchiveUrl(hub: Hub, window: DateWindow): string {
  const params = new URLSearchParams({
    latitude: String(hub.latitude),
    longitude: String(hub.longitude),
    start_date: window.startDate,
    end_date: window.endDate,
    daily: "snowfall_sum,precipitation_sum,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min",
    // "auto" keeps each day on the hub's local calendar, which "days with snow" questions need.
    timezone: "auto",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
  });
  return `${OPEN_METEO_ARCHIVE_URL}?${params}`;
}

// Days with any missing value are dropped: a gap is better than a guessed zero.
export function parseArchiveResponse(hubId: string, raw: unknown): DailyWeather[] {
  const { daily } = archiveResponseSchema.parse(raw);
  const rows: DailyWeather[] = [];

  daily.time.forEach((date, index) => {
    const values = [
      daily.snowfall_sum[index],
      daily.precipitation_sum[index],
      daily.wind_gusts_10m_max[index],
      daily.temperature_2m_max[index],
      daily.temperature_2m_min[index],
    ];
    if (values.some((value) => value === null || value === undefined)) return;

    const [snowfallInches, precipitationInches, windGustMph, tempMaxF, tempMinF] = values as number[];
    rows.push({ hubId, date, snowfallInches, precipitationInches, windGustMph, tempMaxF, tempMinF });
  });

  return rows;
}

export async function fetchDailyWeather(hub: Hub, window: DateWindow): Promise<DailyWeather[]> {
  return parseArchiveResponse(hub.id, await fetchJson(buildArchiveUrl(hub, window)));
}
