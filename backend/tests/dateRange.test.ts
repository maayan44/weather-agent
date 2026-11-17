import { describe, expect, it } from "vitest";
import { daysInclusive, getFetchWindow, getFirstWantedDate, getWantedRange } from "../src/data/dateRange";

const today = new Date("2026-11-17T12:00:00Z");

describe("daysInclusive", () => {
  it("counts both ends, across months and leap years", () => {
    expect(daysInclusive("2026-01-01", "2026-01-03")).toBe(3);
    expect(daysInclusive("2026-01-01", "2026-01-01")).toBe(1);
    expect(daysInclusive("2024-02-01", "2024-03-01")).toBe(30);
    expect(daysInclusive("2026-01-02", "2026-01-01")).toBe(0);
  });
});

describe("wanted range", () => {
  it("starts 3 years (1095 days) before the last available day, which also covers 'last winter'", () => {
    expect(getFirstWantedDate(today)).toBe("2023-11-14");
    expect(getFirstWantedDate(new Date("2027-01-03T00:00:00Z"))).toBe("2023-12-31");
    expect(daysInclusive(getFirstWantedDate(today), "2026-11-12")).toBe(1095);
  });

  it("ends 5 days ago because of the archive delay", () => {
    expect(getWantedRange(today)).toEqual({ startDate: "2023-11-14", endDate: "2026-11-12" });
  });
});

describe("getFetchWindow", () => {
  const wanted = { startDate: "2026-01-01", endDate: "2026-01-31" };

  it("fetches the whole range when the cache is empty", () => {
    expect(getFetchWindow(wanted, 0)).toEqual(wanted);
  });

  it("refills the whole range when a day in the middle is missing", () => {
    expect(getFetchWindow(wanted, 30)).toEqual(wanted);
  });

  it("re-fetches only the newest 10 days when everything is stored", () => {
    expect(getFetchWindow(wanted, 31)).toEqual({ startDate: "2026-01-22", endDate: "2026-01-31" });
  });

  it("never starts before the wanted range", () => {
    const short = { startDate: "2026-01-01", endDate: "2026-01-05" };
    expect(getFetchWindow(short, 5)).toEqual(short);
  });
});
