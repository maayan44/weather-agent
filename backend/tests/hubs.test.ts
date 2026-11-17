import { describe, expect, it } from "vitest";
import { getHub, getHubsByRegion, HUBS } from "../src/config/hubs";

describe("hubs config", () => {
  it("has exactly 10 hubs", () => {
    expect(HUBS).toHaveLength(10);
  });

  it("has unique ids", () => {
    expect(new Set(HUBS.map((hub) => hub.id)).size).toBe(HUBS.length);
  });

  it("has coordinates inside the continental US", () => {
    for (const hub of HUBS) {
      expect(hub.latitude).toBeGreaterThan(24);
      expect(hub.latitude).toBeLessThan(50);
      expect(hub.longitude).toBeGreaterThan(-125);
      expect(hub.longitude).toBeLessThan(-66);
    }
  });

  it("finds a hub by id", () => {
    expect(getHub("denver")?.name).toBe("Denver");
    expect(getHub("paris")).toBeUndefined();
  });

  it("groups the Midwest hubs", () => {
    const names = getHubsByRegion("Midwest").map((hub) => hub.name);
    expect(names).toEqual(["Chicago", "Minneapolis", "Detroit"]);
  });
});
