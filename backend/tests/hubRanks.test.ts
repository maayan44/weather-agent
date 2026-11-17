import { describe, expect, it } from "vitest";
import { HUBS } from "../src/config/hubs";
import { getAllHubRisks } from "../src/scoring/hubRiskService";
import { computeHubRanks } from "../src/scoring/hubRanks";
import { createSeededDb } from "./helpers/seedDatabase";

// The seeded world: Minneapolis is snowy, Phoenix is hot, Miami is hurricane-prone, the other seven are quiet.
const risks = getAllHubRisks(createSeededDb(), HUBS);

describe("computeHubRanks", () => {
  it("ranks a hub 1st when it is the most exposed to a hazard", () => {
    expect(computeHubRanks("phoenix", risks).hazards.heat).toBe(1);
    expect(computeHubRanks("minneapolis", risks).hazards.winter).toBe(1);
    expect(computeHubRanks("miami", risks).hazards.hurricane).toBe(1);
  });

  it("says how many hubs there are", () => {
    expect(computeHubRanks("chicago", risks).out_of).toBe(10);
  });

  it("gives equal scores the same rank, so a hazard where most hubs score 0 is not a race", () => {
    // Nine hubs have hurricane 0 and Miami has 100: all nine share 2nd place.
    const ranks = ["chicago", "denver", "dallas", "houston"].map((id) => computeHubRanks(id, risks).hazards.hurricane);
    expect(ranks).toEqual([2, 2, 2, 2]);
  });

  it("ranks overall exposure from the composite score", () => {
    const overall = Object.fromEntries(HUBS.map((hub) => [hub.id, computeHubRanks(hub.id, risks).composite]));
    // Whoever has the highest composite is 1st, and nobody is ranked below the number of hubs.
    const top = [...risks].sort((a, b) => b.compositeScore - a.compositeScore)[0];
    expect(overall[top.hubId]).toBe(1);
    expect(Math.max(...Object.values(overall))).toBeLessThanOrEqual(10);
  });

  it("refuses a hub that was not scored", () => {
    expect(() => computeHubRanks("paris", risks)).toThrow(/not among/);
  });
});
