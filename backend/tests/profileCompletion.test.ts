import { describe, expect, it } from "vitest";
import { HUBS } from "../src/config/hubs";
import { completeHubProfile, findProfileHub, ordinal } from "../src/agent/profileCompletion";
import { runAgent } from "../src/agent/runAgent";
import { getAllHubRisks } from "../src/scoring/hubRiskService";
import { createSeededDb } from "./helpers/seedDatabase";
import { answerTurn, makeAnswer, scriptedModel, toolUseTurn } from "./helpers/scriptedModel";

const db = createSeededDb();
const risks = getAllHubRisks(db, HUBS);
const entry = (hub_id: string, metric: string, score = 0) => ({ rank: 1, hub_id: hub_id as "chicago", metric: metric as "wind", score, note: "" });

describe("ordinal", () => {
  it("writes 1st, 2nd, 3rd, 4th and the teens correctly", () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "10th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});

describe("findProfileHub", () => {
  it("recognises one hub shown for several different scores", () => {
    expect(findProfileHub([entry("chicago", "composite"), entry("chicago", "wind")])).toBe("chicago");
  });

  it("does not treat a ranking, a comparison or a single lookup as a profile", () => {
    expect(findProfileHub([entry("houston", "flood"), entry("miami", "flood")])).toBeNull(); // a ranking
    expect(findProfileHub([entry("houston", "flood"), entry("miami", "wind")])).toBeNull(); // a comparison
    expect(findProfileHub([entry("chicago", "wind")])).toBeNull(); // one score
    expect(findProfileHub([entry("chicago", "wind"), entry("chicago", "wind")])).toBeNull(); // the same score twice
    expect(findProfileHub([])).toBeNull();
  });
});

describe("completeHubProfile", () => {
  it("fills in all six scores from the engine when the model showed only some", () => {
    const partial = [entry("phoenix", "composite", 1), entry("phoenix", "heat", 2)];
    const completed = completeHubProfile(partial, risks)!;

    expect(completed.ranking).toHaveLength(6);
    expect(completed.added).toBe(4);
    expect(completed.ranking.map((item) => item.metric)).toContain("flood");
    const heat = completed.ranking.find((item) => item.metric === "heat")!;
    expect(heat.score).toBe(100); // the engine's value, not the model's 2
  });

  it("puts overall first and then the hazards from most to least exposed", () => {
    const completed = completeHubProfile([entry("phoenix", "composite"), entry("phoenix", "wind")], risks)!;
    const scores = completed.ranking.slice(1).map((item) => item.score);
    expect(completed.ranking[0].metric).toBe("composite");
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(completed.ranking[1].metric).toBe("heat"); // Phoenix's strongest hazard in the seeded data
  });

  it("gives every entry the hub's rank among all hubs, in words", () => {
    const completed = completeHubProfile([entry("phoenix", "composite"), entry("phoenix", "heat")], risks)!;
    const heat = completed.ranking.find((item) => item.metric === "heat")!;
    expect(heat.rank).toBe(1);
    expect(heat.note).toBe("1st of 10 hubs");
    // Hubs that score the same share a rank: seven quiet hubs tie on hurricane behind Miami.
    expect(completed.ranking.find((item) => item.metric === "hurricane")!.note).toBe("2nd of 10 hubs");
  });

  it("is a no-op for a complete profile except for the ranks, and adds nothing", () => {
    const six = ["composite", "winter", "flood", "hurricane", "heat", "wind"].map((metric) => entry("miami", metric));
    const completed = completeHubProfile(six, risks)!;
    expect(completed.added).toBe(0);
    expect(completed.ranking).toHaveLength(6);
  });

  it("leaves anything that is not a profile alone", () => {
    expect(completeHubProfile([entry("houston", "flood"), entry("miami", "flood")], risks)).toBeNull();
  });
});

describe("in a finished answer", () => {
  const today = new Date("2026-11-17T12:00:00Z");

  it("completes a partial profile the model gave and records it", async () => {
    const partial = makeAnswer({ ranking: [entry("phoenix", "composite", 1), entry("phoenix", "heat", 2)] });
    const { callModel } = scriptedModel([toolUseTurn([{ id: "t1", name: "get_hub_risk", input: { hub: "phoenix" } }]), answerTurn(partial)]);
    const result = await runAgent({ message: "How exposed is Phoenix?", callModel, context: { db }, today });

    expect(result.answer.ranking).toHaveLength(6);
    expect(result.answer.ranking.every((item) => item.note.endsWith("of 10 hubs"))).toBe(true);
    expect(result.corrections).toContain("completed the hub profile: added 4 score(s)");
  });

  it("does not touch an ordinary ranking", async () => {
    const ranking = makeAnswer({ ranking: [{ rank: 1, hub_id: "minneapolis", metric: "winter", score: 0, note: "" }, { rank: 2, hub_id: "chicago", metric: "winter", score: 0, note: "" }] });
    const { callModel } = scriptedModel([answerTurn(ranking)]);
    const result = await runAgent({ message: "Winter?", callModel, context: { db }, today });
    expect(result.answer.ranking.map((item) => item.hub_id).sort()).toEqual(["chicago", "minneapolis"]);
    expect(result.corrections.some((note) => note.includes("completed the hub profile"))).toBe(false);
  });
});
