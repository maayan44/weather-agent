import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "../evals/questions";
import { formatCase, formatSummary } from "../evals/report";
import { runEvalCase } from "../evals/runCase";
import { createSeededDb } from "./helpers/seedDatabase";
import { answerTurn, makeAnswer, scriptedModel, toolUseTurn } from "./helpers/scriptedModel";

const db = createSeededDb();
const today = new Date("2026-11-17T12:00:00Z");

function findCase(id: string) {
  const evalCase = EVAL_CASES.find((candidate) => candidate.id === id);
  if (!evalCase) throw new Error(`no case ${id}`);
  return evalCase;
}

const midwestRanking = ["minneapolis", "chicago", "detroit"].map((hub, index) => ({
  rank: index + 1,
  hub_id: hub as "chicago",
  metric: "winter" as const,
  score: 0,
  note: "",
}));
const rankMidwest = toolUseTurn([{ id: "t1", name: "rank_hubs", input: { region: "Midwest", hazard: "winter" } }]);

describe("runEvalCase", () => {
  it("passes a case when the agent does everything the checks ask for", async () => {
    const { callModel } = scriptedModel([rankMidwest, answerTurn(makeAnswer({ ranking: midwestRanking }))]);
    const result = await runEvalCase(findCase("midwest-winter"), { callModel, db, today });
    expect(result.passed).toBe(true);
    expect(result.turns[0].checks.every((check) => check.passed)).toBe(true);
    expect(result.turns[0].toolsUsed).toEqual(["rank_hubs"]);
  });

  it("fails the case, and names the failing check, when the agent skips the tool", async () => {
    const { callModel } = scriptedModel([answerTurn(makeAnswer({ ranking: midwestRanking }))]);
    const result = await runEvalCase(findCase("midwest-winter"), { callModel, db, today });
    expect(result.passed).toBe(false);
    const failed = result.turns[0].checks.filter((check) => !check.passed);
    expect(failed.map((check) => check.description)).toEqual([expect.stringContaining("calls rank_hubs")]);
  });

  it("runs follow-up turns with the earlier answer as history", async () => {
    const { callModel, requests } = scriptedModel([
      rankMidwest,
      answerTurn(makeAnswer({ ranking: midwestRanking })),
      toolUseTurn([{ id: "t2", name: "rank_hubs", input: { region: "Midwest", hazard: "flood" } }]),
      answerTurn(makeAnswer({ ranking: midwestRanking })),
    ]);
    const result = await runEvalCase(findCase("follow-up-flood"), { callModel, db, today });
    expect(result.passed).toBe(true);
    expect(result.turns).toHaveLength(2);
    const secondTurnRequest = requests[2].messages;
    expect(secondTurnRequest.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  });

  it("marks the case failed, with the reason, when the agent itself errors, and stops the case", async () => {
    const callModel = async () => {
      throw new Error("boom");
    };
    const result = await runEvalCase(findCase("follow-up-flood"), { callModel, db, today });
    expect(result.passed).toBe(false);
    expect(result.turns).toHaveLength(1); // turn 2 depends on turn 1, so it was not attempted
    expect(result.turns[0].error).toBe("boom");
    expect(result.turns[0].checks.every((check) => !check.passed && check.detail.includes("boom"))).toBe(true);
  });

  it("does not pass a multi-turn case that stopped early, even if its checks passed", async () => {
    const { callModel } = scriptedModel([rankMidwest, answerTurn(makeAnswer({ ranking: midwestRanking })), answerTurn({ bad: "shape" })]);
    const result = await runEvalCase(findCase("follow-up-flood"), { callModel, db, today });
    expect(result.passed).toBe(false);
  });
});

describe("report", () => {
  it("shows failing checks always and passing checks only when verbose", async () => {
    const { callModel } = scriptedModel([answerTurn(makeAnswer({ ranking: midwestRanking }))]);
    const result = await runEvalCase(findCase("midwest-winter"), { callModel, db, today });

    const quiet = formatCase(result, false);
    expect(quiet).toContain("[FAIL] midwest-winter");
    expect(quiet).toContain("calls rank_hubs");
    expect(quiet).not.toContain("ranking covers exactly");

    expect(formatCase(result, true)).toContain("ranking covers exactly");
  });

  it("summarizes cases, checks and corrections", async () => {
    const { callModel } = scriptedModel([rankMidwest, answerTurn(makeAnswer({ ranking: midwestRanking }))]);
    const result = await runEvalCase(findCase("midwest-winter"), { callModel, db, today });
    const summary = formatSummary([result]);
    expect(summary).toContain("Cases:  1/1 passed");
    expect(summary).toContain("Checks: 3/3 passed");
  });
});
