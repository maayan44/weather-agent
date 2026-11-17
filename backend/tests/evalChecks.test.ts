import { describe, expect, it } from "vitest";
import type { AgentRunResult } from "../src/agent/runAgent";
import type { AgentAnswer } from "../src/agent/schemas";
import { getHubScore } from "../src/scoring/hubRiskService";
import { evaluateCheck } from "../evals/checks";
import type { Check } from "../evals/questions";
import { createSeededDb } from "./helpers/seedDatabase";
import { makeAnswer } from "./helpers/scriptedModel";

const db = createSeededDb();

function makeRun(answer: Partial<AgentAnswer> = {}, extra: Partial<AgentRunResult> = {}): AgentRunResult {
  return { answer: makeAnswer(answer), toolCalls: [], corrections: [], usage: { inputTokens: 0, outputTokens: 0 }, ...extra };
}

function passes(check: Check, run: AgentRunResult): boolean {
  return evaluateCheck(check, run, db).passed;
}

function entry(hubId: string, score = 0) {
  return { rank: 1, hub_id: hubId as "chicago", metric: "winter" as const, score, note: "" };
}

describe("calls_tool", () => {
  const run = makeRun({}, { toolCalls: [{ name: "rank_hubs", input: { region: "Midwest", hazard: "winter" } }] });

  it("passes when the tool was called, with or without argument checks", () => {
    expect(passes({ kind: "calls_tool", tool: "rank_hubs" }, run)).toBe(true);
    expect(passes({ kind: "calls_tool", tool: "rank_hubs", input: { region: "Midwest" } }, run)).toBe(true);
  });

  it("fails on a different tool or a different argument", () => {
    expect(passes({ kind: "calls_tool", tool: "compare_hubs" }, run)).toBe(false);
    expect(passes({ kind: "calls_tool", tool: "rank_hubs", input: { hazard: "flood" } }, run)).toBe(false);
  });

  it("explains what was actually called", () => {
    const result = evaluateCheck({ kind: "calls_tool", tool: "compare_hubs" }, run, db);
    expect(result.detail).toContain("rank_hubs");
  });
});

describe("in_scope, empty, confidence", () => {
  it("checks the scope flag", () => {
    expect(passes({ kind: "in_scope", value: false }, makeRun({ in_scope: false }))).toBe(true);
    expect(passes({ kind: "in_scope", value: false }, makeRun({ in_scope: true }))).toBe(false);
  });

  it("checks that ranking or figures are empty", () => {
    expect(passes({ kind: "empty", field: "ranking" }, makeRun())).toBe(true);
    expect(passes({ kind: "empty", field: "ranking" }, makeRun({ ranking: [entry("denver")] }))).toBe(false);
    expect(passes({ kind: "empty", field: "figures" }, makeRun({ figures: [{ label: "x", value: 1, unit: "" }] }))).toBe(false);
  });

  it("checks confidence with is and not", () => {
    expect(passes({ kind: "confidence", is: "medium" }, makeRun({ confidence: "medium" }))).toBe(true);
    expect(passes({ kind: "confidence", not: "high" }, makeRun({ confidence: "high" }))).toBe(false);
    expect(passes({ kind: "confidence", not: "high" }, makeRun({ confidence: "low" }))).toBe(true);
  });
});

describe("ranking_hubs", () => {
  it("compares the set of hubs and ignores order", () => {
    const run = makeRun({ ranking: [entry("detroit"), entry("chicago")] });
    expect(passes({ kind: "ranking_hubs", hubs: ["chicago", "detroit"] }, run)).toBe(true);
  });

  it("counts a hub once even when it is listed once per hazard", () => {
    const run = makeRun({ ranking: [entry("miami"), entry("houston"), entry("houston"), entry("miami")] });
    expect(passes({ kind: "ranking_hubs", hubs: ["miami", "houston"] }, run)).toBe(true);
  });

  it("fails on a missing, extra or wrong hub", () => {
    const run = makeRun({ ranking: [entry("detroit")] });
    expect(passes({ kind: "ranking_hubs", hubs: ["chicago", "detroit"] }, run)).toBe(false);
    expect(passes({ kind: "ranking_hubs", hubs: ["miami"] }, run)).toBe(false);
  });
});

describe("all_figures_grounded", () => {
  it("fails only when the answer check had to remove figures", () => {
    expect(passes({ kind: "all_figures_grounded" }, makeRun({}, { corrections: ["ranking order was rebuilt from the true scores"] }))).toBe(true);
    expect(passes({ kind: "all_figures_grounded" }, makeRun({}, { corrections: ["removed 1 ungrounded figure(s)"] }))).toBe(false);
  });
});

describe("quotes_engine_score", () => {
  const truth = getHubScore(db, "minneapolis", "winter");

  it("finds the engine's score in the ranking or in the figures", () => {
    const check: Check = { kind: "quotes_engine_score", hub: "minneapolis", metric: "winter" };
    expect(passes(check, makeRun({ ranking: [entry("minneapolis", truth)] }))).toBe(true);
    expect(passes(check, makeRun({ figures: [{ label: "x", value: truth, unit: "" }] }))).toBe(true);
  });

  it("fails when only a different number is quoted", () => {
    const check: Check = { kind: "quotes_engine_score", hub: "minneapolis", metric: "winter" };
    expect(passes(check, makeRun({ figures: [{ label: "x", value: truth + 5, unit: "" }] }))).toBe(false);
  });
});

describe("mentions", () => {
  const run = makeRun({ answer: "No forecasts here.", reasoning: ["Because of the Rank"], assumptions: ["Snow day = 0.1 in"], data_gaps: ["County-level data"] });

  it("is case-insensitive and looks only in the requested field", () => {
    expect(passes({ kind: "mentions", anyOf: ["forecast"], in: "answer" }, run)).toBe(true);
    expect(passes({ kind: "mentions", anyOf: ["rank"], in: "answer" }, run)).toBe(true); // reasoning counts as the answer
    expect(passes({ kind: "mentions", anyOf: ["0.1"], in: "assumptions" }, run)).toBe(true);
    expect(passes({ kind: "mentions", anyOf: ["county"], in: "data_gaps" }, run)).toBe(true);
  });

  it("fails when the word is only in another field", () => {
    expect(passes({ kind: "mentions", anyOf: ["county"], in: "assumptions" }, run)).toBe(false);
    expect(passes({ kind: "mentions", anyOf: ["county"], in: "anywhere" }, run)).toBe(true);
  });
});

describe("tie_acknowledged", () => {
  // In the seeded data Chicago and Detroit are identical, so they are a perfect tie.
  const check: Check = { kind: "tie_acknowledged", hubs: ["detroit", "chicago"], metric: "winter", withinPoints: 3 };

  it("requires the answer to say so when the engine finds a near-tie", () => {
    expect(passes(check, makeRun({ answer: "They are effectively tied." }))).toBe(true);
    expect(passes(check, makeRun({ answer: "Detroit is clearly worse." }))).toBe(false);
  });

  it("does not apply when the hubs are far apart", () => {
    const far: Check = { kind: "tie_acknowledged", hubs: ["minneapolis", "chicago"], metric: "winter", withinPoints: 3 };
    const result = evaluateCheck(far, makeRun({ answer: "Minneapolis is clearly worse." }), db);
    expect(result.passed).toBe(true);
    expect(result.skipped).toBe(true); // reported as skipped, not as a silent pass
    expect(result.detail).toContain("no tie to test");
  });
});
