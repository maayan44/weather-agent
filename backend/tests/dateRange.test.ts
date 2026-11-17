import { describe, expect, it } from "vitest";
import { getMissingWindow } from "../src/data/dateRange";

const today = new Date("2026-11-17T12:00:00Z");

describe("getMissingWindow", () => {
  it("starts from Jan 1 of last year when the cache is empty", () => {
    expect(getMissingWindow(today, null)).toEqual({ startDate: "2025-01-01", endDate: "2026-11-12" });
  });

  it("continues from the day after the newest cached day", () => {
    expect(getMissingWindow(today, "2026-11-01")).toEqual({ startDate: "2026-11-02", endDate: "2026-11-12" });
  });

  it("returns null when the cache is already current", () => {
    expect(getMissingWindow(today, "2026-11-12")).toBeNull();
  });

  it("handles month and year rollover", () => {
    expect(getMissingWindow(today, "2026-10-31")?.startDate).toBe("2026-11-01");
    expect(getMissingWindow(new Date("2027-01-03T00:00:00Z"), "2026-12-31")).toBeNull();
  });
});
