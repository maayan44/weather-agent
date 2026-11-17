import { describe, expect, it } from "vitest";
import { HUBS, getHub } from "../src/config/hubs";
import { buildFemaUrl, parseFemaResponse } from "../src/data/femaClient";
import { buildArchiveUrl, parseArchiveResponse } from "../src/data/openMeteoClient";

describe("Open-Meteo client", () => {
  const denver = getHub("denver")!;

  it("asks for local-time US units", () => {
    const url = buildArchiveUrl(denver, { startDate: "2026-01-01", endDate: "2026-01-31" });
    expect(url).toContain("timezone=auto");
    expect(url).toContain("temperature_unit=fahrenheit");
    expect(url).toContain("precipitation_unit=inch");
    expect(url).toContain("latitude=39.7392");
  });

  it("parses daily arrays into rows", () => {
    const rows = parseArchiveResponse("denver", {
      daily: {
        time: ["2026-01-01", "2026-01-02"],
        snowfall_sum: [1.5, 0],
        precipitation_sum: [0.2, 0],
        wind_gusts_10m_max: [30, 12],
        temperature_2m_max: [35, 40],
        temperature_2m_min: [20, 22],
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      hubId: "denver",
      date: "2026-01-01",
      snowfallInches: 1.5,
      precipitationInches: 0.2,
      windGustMph: 30,
      tempMaxF: 35,
      tempMinF: 20,
    });
  });

  it("drops days with missing values instead of inventing zeros", () => {
    const rows = parseArchiveResponse("denver", {
      daily: {
        time: ["2026-01-01", "2026-01-02"],
        snowfall_sum: [1, null],
        precipitation_sum: [0, 0],
        wind_gusts_10m_max: [10, 10],
        temperature_2m_max: [30, 30],
        temperature_2m_min: [20, 20],
      },
    });
    expect(rows.map((row) => row.date)).toEqual(["2026-01-01"]);
  });

  it("rejects a malformed response", () => {
    expect(() => parseArchiveResponse("denver", { error: true })).toThrow();
  });
});

describe("FEMA client", () => {
  it("queries every hub county by FIPS code", () => {
    const url = decodeURIComponent(buildFemaUrl(HUBS));
    expect(url).toContain("'48201'");
    expect(url).toContain("'06037'");
  });

  it("maps FEMA's not-applicable nulls to zero", () => {
    const hubs = [getHub("denver")!, getHub("miami")!];
    const result = parseFemaResponse(hubs, {
      features: [
        { attributes: { STCOFIPS: "08031", HRCN_AFREQ: null, CFLD_AFREQ: null, IFLD_AFREQ: 0.82 } },
        { attributes: { STCOFIPS: "12086", HRCN_AFREQ: 0.3, CFLD_AFREQ: 2.25, IFLD_AFREQ: 4 } },
      ],
    });
    expect(result[0]).toEqual({
      hubId: "denver",
      hurricaneAnnualFrequency: 0,
      coastalFloodAnnualFrequency: 0,
      inlandFloodAnnualFrequency: 0.82,
    });
    expect(result[1].hurricaneAnnualFrequency).toBe(0.3);
  });

  it("fails loudly when a hub county is missing", () => {
    expect(() => parseFemaResponse([getHub("denver")!], { features: [] })).toThrow(/Denver/);
  });
});
