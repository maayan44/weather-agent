import { describe, expect, it } from "vitest";
import { getHub } from "../src/config/hubs";
import { explainHubRisk } from "../src/scoring/explain";
import { getHubRisk } from "../src/scoring/hubRiskService";
import { createSeededDb } from "./helpers/seedDatabase";

describe("explainHubRisk", () => {
  const db = createSeededDb();

  it("lists the biggest contributors first", () => {
    const risk = getHubRisk(db, getHub("phoenix")!);
    const [top] = explainHubRisk(risk);
    expect(top.hazard).toBe("heat");
    expect(top.points).toBe(10); // 100 * 0.5 * heat weight 0.2
  });

  it("adds up to the composite score when all contributors are included", () => {
    const risk = getHubRisk(db, getHub("minneapolis")!);
    const total = explainHubRisk(risk, 100).reduce((sum, item) => sum + item.points, 0);
    expect(total).toBeCloseTo(risk.compositeScore, 0);
  });

  it("limits the list to the requested size", () => {
    expect(explainHubRisk(getHubRisk(db, getHub("miami")!), 2)).toHaveLength(2);
  });
});
