import { afterEach, describe, expect, it, vi } from "vitest";
import { HUBS, getHub } from "../src/config/hubs";
import { addDays, daysInclusive } from "../src/data/dateRange";
import { openDatabase } from "../src/data/db";
import { getHazardsFetchedAt, getHubHazards } from "../src/data/hazardRepository";
import { fetchJson } from "../src/data/httpJson";
import { ingestAll } from "../src/data/ingestion";
import { isDataReady } from "../src/data/readiness";
import { countStoredDays } from "../src/data/weatherRepository";

const today = new Date("2026-11-17T12:00:00Z");
const TWO_HUBS = [getHub("denver")!, getHub("miami")!];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// A fake Open-Meteo: returns one quiet day for every date in the requested range.
function weatherFor(url: URL) {
  const start = url.searchParams.get("start_date")!;
  const days = daysInclusive(start, url.searchParams.get("end_date")!);
  const time = Array.from({ length: days }, (_, index) => addDays(start, index));
  const filled = (value: number) => time.map(() => value);
  return json({
    daily: { time, snowfall_sum: filled(0), precipitation_sum: filled(0), wind_gusts_10m_max: filled(10), temperature_2m_max: filled(60), temperature_2m_min: filled(40) },
  });
}

function femaFor(url: URL) {
  const features = TWO_HUBS.map((hub) => ({ attributes: { STCOFIPS: hub.countyFips, HRCN_AFREQ: 0.1, CFLD_AFREQ: null, IFLD_AFREQ: 1 } }));
  return url.searchParams.get("where") ? json({ features }) : json({}, 500);
}

interface FakeOptions {
  failWeatherFor?: string;
  femaDown?: boolean;
}

function fakeInternet({ failWeatherFor, femaDown }: FakeOptions = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(input);
    calls.push(url.hostname);
    if (url.hostname.includes("open-meteo")) {
      return failWeatherFor && url.searchParams.get("latitude") === String(getHub(failWeatherFor)!.latitude) ? json({}, 404) : weatherFor(url);
    }
    return femaDown ? json({}, 404) : femaFor(url);
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ingestAll", () => {
  it("fills an empty database for every hub", async () => {
    fakeInternet();
    const db = openDatabase(":memory:");
    const summary = await ingestAll(db, TWO_HUBS, today);
    expect(summary.failures).toEqual([]);
    expect(summary.hazardsSource).toBe("fema");
    expect(isDataReady(db, TWO_HUBS)).toBe(true);
    expect(countStoredDays(db, "denver", "2024-12-01", "2026-11-12")).toBe(daysInclusive("2024-12-01", "2026-11-12"));
  });

  it("keeps going when one hub's weather fails, and reports it", async () => {
    fakeInternet({ failWeatherFor: "denver" });
    const db = openDatabase(":memory:");
    const summary = await ingestAll(db, TWO_HUBS, today);
    expect(summary.failures).toEqual([expect.stringContaining("Denver weather")]);
    expect(countStoredDays(db, "miami", "2024-12-01", "2026-11-12")).toBeGreaterThan(0); // the hub after it still loaded
    expect(getHubHazards(db, "miami")).not.toBeNull(); // and FEMA still ran
  });

  it("falls back to the bundled FEMA snapshot when FEMA is down on a fresh server", async () => {
    fakeInternet({ femaDown: true });
    const db = openDatabase(":memory:");
    const summary = await ingestAll(db, TWO_HUBS, today);
    expect(summary.hazardsSource).toBe("snapshot");
    expect(summary.failures).toEqual([expect.stringContaining("FEMA")]);
    expect(isDataReady(db, TWO_HUBS)).toBe(true); // chat can work
    expect(getHazardsFetchedAt(db)?.getTime()).toBe(0); // marked stale, so FEMA is tried again next time
  });

  it("keeps stored FEMA data when FEMA is down later", async () => {
    fakeInternet();
    const db = openDatabase(":memory:");
    await ingestAll(db, TWO_HUBS, today);
    fakeInternet({ femaDown: true });
    const later = new Date("2027-01-20T12:00:00Z"); // over 30 days later, so FEMA is due
    const summary = await ingestAll(db, TWO_HUBS, later);
    expect(summary.hazardsSource).toBe("unchanged");
    expect(getHubHazards(db, "miami")?.hurricaneAnnualFrequency).toBe(0.1); // live value kept, not the snapshot
  });

  it("re-downloads only the newest days when nothing is missing", async () => {
    fakeInternet();
    const db = openDatabase(":memory:");
    await ingestAll(db, TWO_HUBS, today);
    const summary = await ingestAll(db, TWO_HUBS, today);
    expect(summary.weatherRowsSaved).toBe(20); // 10 recent days x 2 hubs
  });

  it("refills a gap in the middle of the data", async () => {
    fakeInternet();
    const db = openDatabase(":memory:");
    await ingestAll(db, TWO_HUBS, today);
    db.prepare("DELETE FROM daily_weather WHERE hub_id = 'denver' AND date = '2025-06-15'").run();
    await ingestAll(db, TWO_HUBS, today);
    expect(countStoredDays(db, "denver", "2025-06-15", "2025-06-15")).toBe(1);
  });

  it("works for all 10 real hubs", async () => {
    const db = openDatabase(":memory:");
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(input);
      if (url.hostname.includes("open-meteo")) return weatherFor(url);
      return json({ features: HUBS.map((hub) => ({ attributes: { STCOFIPS: hub.countyFips, HRCN_AFREQ: 0, CFLD_AFREQ: 0, IFLD_AFREQ: 1 } })) });
    });
    expect((await ingestAll(db, HUBS, today)).failures).toEqual([]);
    expect(isDataReady(db, HUBS)).toBe(true);
  });
});

describe("fetchJson", () => {
  it("does not retry a request that can never succeed, like a 404", async () => {
    let requests = 0;
    vi.stubGlobal("fetch", async () => {
      requests++;
      return json({}, 404);
    });
    await expect(fetchJson("https://example.test/missing")).rejects.toThrow(/404/);
    expect(requests).toBe(1);
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", async () => json({ ok: true }));
    expect(await fetchJson("https://example.test/ok")).toEqual({ ok: true });
  });
});
