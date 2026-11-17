import { describe, expect, it } from "vitest";
import { groundAnswer } from "../src/agent/groundAnswer";
import type { AgentAnswer } from "../src/agent/schemas";

function makeAnswer(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    in_scope: true,
    answer: "x",
    ranking: [],
    figures: [],
    reasoning: [],
    assumptions: [],
    confidence: "high",
    data_gaps: [],
    ...overrides,
  };
}

const TRUE_SCORES: Record<string, number> = {
  "minneapolis:winter": 85,
  "chicago:winter": 59.9,
  "detroit:winter": 61.2,
  "miami:hurricane": 100,
  "houston:hurricane": 61.2,
  "houston:flood": 83.9,
  "miami:flood": 46.5,
};
const lookup = (hubId: string, metric: string) => TRUE_SCORES[`${hubId}:${metric}`];

function entry(hubId: string, score: number, rank: number, metric: "winter" | "hurricane" | "flood" = "winter") {
  return { rank, hub_id: hubId as "chicago", metric, score, note: "" };
}

describe("groundAnswer: figures", () => {
  it("accepts figures that appear in a tool result, found at any depth", () => {
    const outputs = [{ result: { percentage: 11.8, nested: [{ daysMatching: 43 }] } }];
    const answer = makeAnswer({
      figures: [
        { label: "snow days %", value: 11.8, unit: "%" },
        { label: "snow days", value: 43, unit: "days" },
      ],
    });
    expect(groundAnswer(answer, outputs, lookup).ungroundedFigures).toEqual([]);
  });

  it("flags a figure that no tool returned", () => {
    const answer = makeAnswer({ figures: [{ label: "made up", value: 99, unit: "%" }] });
    expect(groundAnswer(answer, [{ percentage: 11.8 }], lookup).ungroundedFigures).toHaveLength(1);
  });

  it("allows rounding noise but not a different number", () => {
    const outputs = [{ value: 59.9 }];
    expect(groundAnswer(makeAnswer({ figures: [{ label: "a", value: 59.9, unit: "" }] }), outputs, lookup).ungroundedFigures).toEqual([]);
    expect(groundAnswer(makeAnswer({ figures: [{ label: "a", value: 60, unit: "" }] }), outputs, lookup).ungroundedFigures).toHaveLength(1);
  });
});

describe("groundAnswer: ranking", () => {
  it("leaves a correct ranking untouched", () => {
    const answer = makeAnswer({ ranking: [entry("minneapolis", 85, 1), entry("detroit", 61.2, 2), entry("chicago", 59.9, 3)] });
    const result = groundAnswer(answer, [], lookup);
    expect(result.corrections).toEqual([]);
    expect(result.answer.ranking.map((item) => item.hub_id)).toEqual(["minneapolis", "detroit", "chicago"]);
  });

  it("overwrites a wrong score with the engine's score", () => {
    const answer = makeAnswer({ ranking: [entry("minneapolis", 90, 1)] });
    const result = groundAnswer(answer, [], lookup);
    expect(result.answer.ranking[0].score).toBe(85);
    expect(result.corrections[0]).toContain("minneapolis winter score changed from 90 to 85");
  });

  it("ranks each hazard separately when one answer compares two hazards", () => {
    // The model listed each hub once per hazard, interleaved, with ranks counted across both.
    const answer = makeAnswer({
      ranking: [
        entry("miami", 100, 1, "hurricane"),
        entry("houston", 83.9, 2, "flood"),
        entry("houston", 61.2, 3, "hurricane"),
        entry("miami", 46.5, 4, "flood"),
      ],
    });
    const result = groundAnswer(answer, [], lookup);
    expect(result.corrections).toEqual([]); // the order within each hazard was right
    expect(result.answer.ranking.map((item) => [item.metric, item.hub_id, item.rank])).toEqual([
      ["hurricane", "miami", 1],
      ["hurricane", "houston", 2],
      ["flood", "houston", 1],
      ["flood", "miami", 2],
    ]);
  });

  it("corrects a wrong order inside one hazard without touching the other", () => {
    const answer = makeAnswer({
      ranking: [
        entry("houston", 61.2, 1, "hurricane"),
        entry("miami", 100, 2, "hurricane"),
        entry("houston", 83.9, 1, "flood"),
        entry("miami", 46.5, 2, "flood"),
      ],
    });
    const result = groundAnswer(answer, [], lookup);
    expect(result.corrections).toEqual(["ranking order was rebuilt from the true scores"]);
    expect(result.answer.ranking.filter((item) => item.metric === "hurricane").map((item) => item.hub_id)).toEqual(["miami", "houston"]);
    expect(result.answer.ranking.filter((item) => item.metric === "flood").map((item) => item.hub_id)).toEqual(["houston", "miami"]);
  });

  it("rebuilds the order and ranks when the model got the order wrong", () => {
    const answer = makeAnswer({ ranking: [entry("chicago", 59.9, 1), entry("detroit", 61.2, 2)] });
    const result = groundAnswer(answer, [], lookup);
    expect(result.answer.ranking.map((item) => [item.hub_id, item.rank])).toEqual([["detroit", 1], ["chicago", 2]]);
    expect(result.corrections).toContain("ranking order was rebuilt from the true scores");
  });
});
