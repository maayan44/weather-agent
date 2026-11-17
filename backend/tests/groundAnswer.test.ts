import { describe, expect, it } from "vitest";
import { extractNumbers, groundAnswer } from "../src/agent/groundAnswer";
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

describe("groundAnswer: figures that repeat the ranking", () => {
  it("drops a score figure that is already a bar, and says so", () => {
    const answer = makeAnswer({
      ranking: [entry("minneapolis", 85, 1)],
      figures: [
        { label: "Minneapolis winter score", value: 85, unit: "score (0-100)" },
        { label: "Freezing days", value: 64, unit: "days" },
      ],
    });
    const result = groundAnswer(answer, [{ a: 85, b: 64 }], lookup);
    expect(result.answer.figures.map((figure) => figure.label)).toEqual(["Freezing days"]);
    expect(result.corrections).toContain("dropped 1 figure(s) that repeat ranking scores");
  });

  it("keeps a figure that merely has the same value but is not a score", () => {
    const answer = makeAnswer({ ranking: [entry("minneapolis", 85, 1)], figures: [{ label: "Hot days", value: 85, unit: "days" }] });
    expect(groundAnswer(answer, [{ days: 85 }], lookup).answer.figures).toHaveLength(1);
  });

  it("keeps a score figure for a hub that is not in the ranking", () => {
    const answer = makeAnswer({ ranking: [entry("minneapolis", 85, 1)], figures: [{ label: "Chicago flood score", value: 44, unit: "score (0-100)" }] });
    expect(groundAnswer(answer, [{ flood: 44 }], lookup).answer.figures).toHaveLength(1);
  });
});

describe("groundAnswer: numbers in the answer text", () => {
  it("flags a number in the text that no tool returned", () => {
    const answer = makeAnswer({ answer: "Denver had snow on 99.5% of days." });
    expect(groundAnswer(answer, [{ percentage: 9 }], lookup).unverifiedTextNumbers).toEqual([99.5]);
  });

  it("flags a difference the model worked out itself", () => {
    const answer = makeAnswer({ reasoning: ["Minneapolis leads Detroit by 23.8 points."] });
    expect(groundAnswer(answer, [{ a: 85, b: 61.2 }], lookup).unverifiedTextNumbers).toEqual([23.8]);
  });

  it("accepts tool numbers, quoted figures, small counts, years and dates", () => {
    const answer = makeAnswer({
      answer: "Detroit scores 61.2, ranks 2nd of 3, in 2025; data 2025-11-13 to 2026-11-12; 6,810 rows.",
      figures: [{ label: "rows", value: 6810, unit: "rows" }],
    });
    expect(groundAnswer(answer, [{ score: 61.2, rows: 6810 }], lookup).unverifiedTextNumbers).toEqual([]);
  });

  // The four false alarms seen in the live eval run:
  it("accepts facts from the system prompt, such as weights and the 0-100 scale", () => {
    const answer = makeAnswer({ answer: "Weights: winter 0.25, wind 0.15; Dallas scores 19.9 out of 100." });
    const promptNumbers = extractNumbers("Weights: winter 0.25, wind 0.15. Composite risk is 0-100.");
    expect(groundAnswer(answer, [{ composite: 19.9 }], lookup, promptNumbers).unverifiedTextNumbers).toEqual([]);
  });

  it("ignores dates written in words", () => {
    const answer = makeAnswer({ answer: "15.8 inches from December 1, 2025 to February 28, 2026." });
    expect(groundAnswer(answer, [{ total: 15.8 }], lookup).unverifiedTextNumbers).toEqual([]);
  });

  it("accepts the exact gap between two numbers the answer states", () => {
    const answer = makeAnswer({ answer: "Detroit 61.2 and Chicago 59.9, a gap of 1.3 points." });
    expect(groundAnswer(answer, [{ a: 61.2, b: 59.9 }], lookup).unverifiedTextNumbers).toEqual([]);
  });

  it("still flags a rounded gap the model estimated", () => {
    const answer = makeAnswer({ answer: "Miami (100) is about 39 points above Houston (61.2)." });
    expect(groundAnswer(answer, [{ a: 100, b: 61.2 }], lookup).unverifiedTextNumbers).toEqual([39]);
  });

  it("finds numbers inside tool text, such as a threshold in a label", () => {
    const answer = makeAnswer({ answer: "We count days at or above 95°F." });
    expect(groundAnswer(answer, [{ name: "Days at or above 95°F" }], lookup).unverifiedTextNumbers).toEqual([]);
  });
});

describe("extractNumbers", () => {
  it("reads decimals, negatives and thousands separators, and skips ISO dates", () => {
    expect(extractNumbers("61.2 and -5 and 6,810 on 2026-11-12")).toEqual([61.2, -5, 6810]);
  });

  it("reads a range like 0-100 as two positive numbers", () => {
    expect(extractNumbers("scores are 0-100")).toEqual([0, 100]);
  });

  it("skips day numbers in dates written with month names", () => {
    expect(extractNumbers("Feb 28th and December 1, 2025 had 27 snow days")).toEqual([2025, 27]);
  });
});

describe("groundAnswer: ranking", () => {
  it("leaves a correct ranking untouched", () => {
    const answer = makeAnswer({ confidence: "medium", ranking: [entry("minneapolis", 85, 1), entry("detroit", 61.2, 2), entry("chicago", 59.9, 3)] });
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

  it("drops a duplicate hub-and-hazard entry", () => {
    const answer = makeAnswer({ ranking: [entry("minneapolis", 85, 1), entry("minneapolis", 85, 2)] });
    const result = groundAnswer(answer, [], lookup);
    expect(result.answer.ranking).toHaveLength(1);
    expect(result.corrections).toContain("dropped duplicate ranking entry minneapolis:winter");
  });

  it("lowers high confidence when the ranking contains a near-tie", () => {
    const answer = makeAnswer({ confidence: "high", ranking: [entry("detroit", 61.2, 1), entry("chicago", 59.9, 2)] });
    const result = groundAnswer(answer, [], lookup);
    expect(result.answer.confidence).toBe("medium");
    expect(result.corrections).toContain("confidence lowered to medium: the ranking contains a near-tie");
  });

  it("keeps high confidence when the scores are clearly apart", () => {
    const answer = makeAnswer({ confidence: "high", ranking: [entry("minneapolis", 85, 1), entry("detroit", 61.2, 2)] });
    expect(groundAnswer(answer, [], lookup).answer.confidence).toBe("high");
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
