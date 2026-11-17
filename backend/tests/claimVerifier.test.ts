import { describe, expect, it } from "vitest";
import { buildHubFacts, correctClaims, findClaimProblems, type HubFacts } from "../src/agent/claimVerifier";
import { HUBS } from "../src/config/hubs";
import { getAllHubRisks } from "../src/scoring/hubRiskService";
import { createSeededDb } from "./helpers/seedDatabase";

// Chicago as the live site reported it: wind 79.2 (1st of 10), winter 59.9 (3rd), flood 44 (5th), hurricane 3.1 (7th), heat 0.4 (10th).
const chicago: HubFacts = {
  hubId: "chicago",
  hubName: "Chicago",
  hazardOrder: ["wind", "winter", "flood", "hurricane", "heat"],
  ranks: { out_of: 10, composite: 1, hazards: { winter: 3, flood: 5, hurricane: 7, heat: 10, wind: 1 } },
  compositeIsHighest: true,
  compositeIsLowest: false,
};
const houston: HubFacts = {
  hubId: "houston",
  hubName: "Houston",
  hazardOrder: ["flood", "hurricane", "heat", "winter", "wind"],
  ranks: { out_of: 10, composite: 3, hazards: { winter: 9, flood: 1, hurricane: 2, heat: 4, wind: 10 } },
  compositeIsHighest: false,
  compositeIsLowest: false,
};
const facts = [chicago, houston];
const check = (text: string, fallback: string | null = null) => findClaimProblems(text, facts, fallback);

describe("a hazard's place among one hub's own hazards", () => {
  it("catches the mistake from the live answer: winter is Chicago's second hazard, not its third", () => {
    const problems = check("Over the last six months Chicago had no snow, which leaves out winter, its third-ranked hazard.");
    expect(problems).toEqual(["Chicago's winter is its second-highest hazard, not its third-highest"]);
  });

  it("accepts the correct wording from the earlier live answer", () => {
    expect(check("That window misses winter, Chicago's second-highest hazard.")).toEqual([]);
    expect(check("That window leaves out winter, Chicago's second-highest hazard.")).toEqual([]);
  });

  it("reads digits and different adjectives", () => {
    expect(check("Chicago's flood is its 2nd highest hazard.")).toHaveLength(1);
    expect(check("Chicago's flood is its third-largest hazard.")).toEqual([]);
    expect(check("Wind is Chicago's first-ranked hazard.")).toEqual([]);
    expect(check("Wind is Chicago's top hazard.")).toEqual([]); // "top" with no ordinal is not a claim about a position
  });

  it("uses the hub the answer is about when the sentence does not name one", () => {
    expect(check("Winter is its third-highest hazard.", "chicago")).toHaveLength(1);
    expect(check("Winter is its second-highest hazard.", "chicago")).toEqual([]);
  });

  it("stays silent when it cannot tell which hazard is meant", () => {
    expect(check("Chicago's wind and winter are its second-highest hazard group.")).toEqual([]); // two hazards
    expect(check("Chicago has a third-ranked hazard.")).toEqual([]); // none named
  });
});

describe("a hub's place among all the hubs, for one hazard", () => {
  it("accepts the ranks the live answers used", () => {
    expect(check("Chicago is driven mainly by wind (79.2, 1st of 10 hubs) with winter at 59.9 (3rd of 10).")).toEqual([]);
    expect(check("Winter (59.9, 3rd of 10 hubs) and flood (44, 5th of 10 hubs) are next.", "chicago")).toEqual([]);
  });

  it("catches a wrong rank, naming the right one", () => {
    expect(check("Chicago's winter (59.9, 2nd of 10 hubs) is high.")).toEqual(["Chicago ranks 3 of 10 hubs for winter, not 2 of 10"]);
  });

  it("catches a wrong total", () => {
    expect(check("Chicago's wind (79.2, 1st of 9 hubs) leads.")).toHaveLength(1);
  });

  it("does not guess when another hazard name sits between the hazard and the rank", () => {
    expect(check("Chicago's flood and wind (44, 5th of 10) matter.")).toEqual([]);
  });

  it("judges each hub by the name in its own sentence", () => {
    expect(check("Houston's flood (83.9, 1st of 10 hubs) leads. Chicago's flood (44, 5th of 10 hubs) trails.")).toEqual([]);
    expect(check("Houston's flood (83.9, 5th of 10 hubs) leads.")).toEqual(["Houston ranks 1 of 10 hubs for flood, not 5 of 10"]);
  });

  it("does not judge a sentence that names two hubs", () => {
    expect(check("Houston's flood is higher than Chicago's flood (44, 9th of 10).")).toEqual([]);
  });
});

describe("a hub's overall place", () => {
  it("accepts correct overall ranks in both phrasings", () => {
    expect(check("Chicago's composite of 36.3 (1st of 10 hubs) is driven by wind.")).toEqual([]);
    expect(check("Chicago ranks 1st of 10 hubs overall.")).toEqual([]);
    expect(check("Chicago is ranking 1st of 10 overall.")).toEqual([]);
  });

  it("catches wrong overall ranks", () => {
    expect(check("Chicago ranks 2nd of 10 hubs overall.")).toEqual(["Chicago ranks 1 of 10 hubs overall, not 2 of 10"]);
    expect(check("Houston's composite (31.9, 1st of 10 overall) is high.")).toHaveLength(1);
  });

  it("checks 'the highest overall score' against the engine", () => {
    expect(check("Chicago has the highest composite risk of the 10 hubs (36.3).")).toEqual([]);
    expect(check("Houston has the highest composite risk of the 10 hubs.")).toEqual(["Houston does not have the highest overall score of the 10 hubs"]);
    expect(check("Chicago has the lowest composite score of the 10 hubs.")).toHaveLength(1);
  });
});

describe("things it must leave alone", () => {
  it("ignores text with no ranking claims, empty text and unknown hubs", () => {
    expect(check("Chicago had 7 days of heavy rain and 1 day of gusts over 50 mph.")).toEqual([]);
    expect(check("")).toEqual([]);
    expect(check("Seattle's wind (50, 1st of 10 hubs).")).toEqual([]); // not one of the hubs
    expect(check("Wind (79.2, 1st of 10 hubs).")).toEqual([]); // no hub to judge against
  });

  it("reports the same problem once", () => {
    expect(check("Chicago ranks 2nd of 10 hubs overall. Chicago ranks 2nd of 10 hubs overall.")).toHaveLength(1);
  });
});

describe("buildHubFacts from the real scoring engine", () => {
  const seeded = buildHubFacts(getAllHubRisks(createSeededDb(), HUBS));
  const byId = (id: string) => seeded.find((hub) => hub.hubId === id)!;

  it("orders a hub's hazards by score, highest first", () => {
    expect(byId("phoenix").hazardOrder[0]).toBe("heat");
    expect(byId("minneapolis").hazardOrder[0]).toBe("winter");
  });

  it("knows each hub's ranks and whether it has the highest or lowest overall score", () => {
    expect(byId("phoenix").ranks.hazards.heat).toBe(1);
    expect(seeded.filter((hub) => hub.compositeIsHighest).length).toBeGreaterThanOrEqual(1);
    expect(seeded.filter((hub) => hub.compositeIsLowest).length).toBeGreaterThanOrEqual(1);
  });

  it("covers all 10 hubs", () => {
    expect(seeded).toHaveLength(10);
  });
});

describe("correctClaims writes the engine's true fact into the text", () => {
  const fix = (text: string) => correctClaims(text, facts, null).text;

  it("turns the live mistake into the true statement", () => {
    expect(fix("Over six months Chicago had no snow, which leaves out winter, its third-ranked hazard.")).toBe("Over six months Chicago had no snow, which leaves out winter, its second-highest hazard.");
  });

  it("fixes a wrong hub rank and keeps the score beside it", () => {
    expect(fix("Chicago's winter (59.9, 2nd of 10 hubs) is high.")).toBe("Chicago's winter (59.9, 3rd of 10 hubs) is high.");
    expect(fix("Chicago ranks 2nd of 10 hubs overall.")).toBe("Chicago ranks 1st of 10 hubs overall.");
  });

  it("drops only the sentence that has no clean rewrite", () => {
    expect(fix("Houston has the highest composite risk of the 10 hubs. Houston's flood leads.")).toBe("Houston's flood leads.");
  });

  it("leaves a true text exactly as it was", () => {
    const text = "Chicago ranks 1st of 10 hubs overall, and winter is its second-highest hazard.";
    expect(correctClaims(text, facts, null)).toEqual({ text, messages: [] });
  });
});
