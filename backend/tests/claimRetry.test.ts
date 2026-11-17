import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent/runAgent";
import { createSeededDb } from "./helpers/seedDatabase";
import { answerTurn, makeAnswer, scriptedModel, toolUseTurn } from "./helpers/scriptedModel";

// In the seeded world Phoenix's strongest hazard is heat (1st of 10 hubs), so any other ordinal for it is wrong.
const context = { db: createSeededDb() };
const today = new Date("2026-11-17T12:00:00Z");
const lookUpPhoenix = toolUseTurn([{ id: "t1", name: "get_hub_risk", input: { hub: "phoenix" } }]);

const wrong = "Phoenix's heat is its second-highest hazard.";
const right = "Phoenix's heat is its first-ranked hazard.";

describe("a wrong ranking claim sends the model back for a fix", () => {
  it("retries once with the contradiction spelled out, and returns the corrected answer", async () => {
    const { callModel, requests } = scriptedModel([lookUpPhoenix, answerTurn(makeAnswer({ answer: wrong })), answerTurn(makeAnswer({ answer: right }))]);
    const result = await runAgent({ message: "How exposed is Phoenix?", callModel, context, today });

    expect(requests).toHaveLength(3); // look-up, wrong answer, fixed answer
    const feedback = requests[2].messages[requests[2].messages.length - 1].content as string;
    expect(feedback).toContain("contradict the scoring engine");
    expect(feedback).toContain("Phoenix's heat is its highest hazard, not its second-highest");
    expect(result.answer.answer).toBe(right);
    expect(result.answer.data_gaps).toEqual([]);
    expect(result.corrections.some((note) => note.includes("unverified ranking claim"))).toBe(false);
  });

  it("fixes the sentence itself, with the engine's true fact, when the second try is still wrong", async () => {
    const { callModel, requests } = scriptedModel([lookUpPhoenix, answerTurn(makeAnswer({ answer: wrong })), answerTurn(makeAnswer({ answer: wrong }))]);
    const result = await runAgent({ message: "How exposed is Phoenix?", callModel, context, today });

    expect(requests).toHaveLength(3); // one retry, not a loop
    expect(result.answer.answer).toBe("Phoenix's heat is its highest hazard.");
    expect(result.answer.answer).not.toContain("second");
    expect(result.answer.data_gaps).toEqual([]); // nothing false is left to warn about
    expect(result.corrections[0]).toContain("corrected a wrong ranking claim: Phoenix's heat is its highest hazard, not its second-highest");
  });

  it("corrects a wrong rank in a reasoning bullet to the engine's rank", async () => {
    const bad = makeAnswer({ answer: right, reasoning: ["Phoenix's heat (100, 5th of 10 hubs) drives it."] });
    const { callModel } = scriptedModel([lookUpPhoenix, answerTurn(bad), answerTurn(bad)]);
    const result = await runAgent({ message: "How exposed is Phoenix?", callModel, context, today });
    expect(result.answer.reasoning).toEqual(["Phoenix's heat (100, 1st of 10 hubs) drives it."]);
  });

  it("does not retry when every claim is right", async () => {
    const { callModel, requests } = scriptedModel([lookUpPhoenix, answerTurn(makeAnswer({ answer: right }))]);
    const result = await runAgent({ message: "How exposed is Phoenix?", callModel, context, today });
    expect(requests).toHaveLength(2);
    expect(result.answer.data_gaps).toEqual([]);
  });

  it("checks the reasoning bullets and the data gaps, not just the headline", async () => {
    const answer = makeAnswer({ answer: right, reasoning: ["Phoenix's heat (100, 5th of 10 hubs) drives it."] });
    const { callModel, requests } = scriptedModel([lookUpPhoenix, answerTurn(answer), answerTurn(makeAnswer({ answer: right, reasoning: ["Heat drives it."] }))]);
    await runAgent({ message: "How exposed is Phoenix?", callModel, context, today });
    expect(requests).toHaveLength(3);
    expect(requests[2].messages[requests[2].messages.length - 1].content).toContain("Phoenix ranks 1 of 10 hubs for heat, not 5 of 10");
  });

  it("uses the one hub the tools were asked about when a sentence does not name it", async () => {
    const { callModel, requests } = scriptedModel([lookUpPhoenix, answerTurn(makeAnswer({ answer: "Heat is its second-highest hazard." })), answerTurn(makeAnswer({ answer: "Heat is its first-ranked hazard." }))]);
    await runAgent({ message: "How exposed is Phoenix?", callModel, context, today });
    expect(requests).toHaveLength(3);
  });

  it("sends a wrong figure and a wrong claim back together in one message, using the single retry", async () => {
    const both = makeAnswer({ answer: wrong, figures: [{ label: "invented", value: 77.7, unit: "%" }] });
    const { callModel, requests } = scriptedModel([lookUpPhoenix, answerTurn(both), answerTurn(makeAnswer({ answer: right }))]);
    await runAgent({ message: "How exposed is Phoenix?", callModel, context, today });

    const feedback = requests[2].messages[requests[2].messages.length - 1].content as string;
    expect(feedback).toContain("do not appear in any tool result");
    expect(feedback).toContain("contradict the scoring engine");
    expect(requests).toHaveLength(3);
  });

  it("leaves an out-of-scope reply with no tools and no hub alone", async () => {
    const { callModel, requests } = scriptedModel([answerTurn(makeAnswer({ in_scope: false, answer: "Seattle is not one of our hubs." }))]);
    const result = await runAgent({ message: "Seattle?", callModel, context, today });
    expect(requests).toHaveLength(1);
    expect(result.answer.data_gaps).toEqual([]);
  });
});
