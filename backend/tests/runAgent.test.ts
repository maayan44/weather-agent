import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent/runAgent";
import { AgentError } from "../src/agent/types";
import { createSeededDb } from "./helpers/seedDatabase";
import { answerTurn, makeAnswer, scriptedModel, toolUseTurn } from "./helpers/scriptedModel";

const context = { db: createSeededDb() };
const today = new Date("2026-11-17T12:00:00Z");

const rankMidwest = { id: "t1", name: "rank_hubs", input: { region: "Midwest", hazard: "winter" } };

describe("runAgent", () => {
  it("answers directly when no tool is needed", async () => {
    const { callModel, requests } = scriptedModel([answerTurn(makeAnswer({ in_scope: false, answer: "I only cover 10 US hubs." }))]);
    const result = await runAgent({ message: "Weather in Paris?", callModel, context, today });
    expect(result.answer.in_scope).toBe(false);
    expect(result.toolCalls).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("runs the tool the model asked for and feeds the result back", async () => {
    const { callModel, requests } = scriptedModel([toolUseTurn([rankMidwest]), answerTurn(makeAnswer())]);
    const result = await runAgent({ message: "Midwest winter?", callModel, context, today });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("rank_hubs");
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 60 });

    const secondRequest = requests[1].messages;
    const toolResultMessage = secondRequest[secondRequest.length - 1];
    const block = (toolResultMessage.content as Anthropic.ToolResultBlockParam[])[0];
    expect(block.tool_use_id).toBe("t1");
    expect(JSON.parse(block.content as string).ranking[0].hub).toBe("Minneapolis");
  });

  it("returns all parallel tool results in one message", async () => {
    const { callModel, requests } = scriptedModel([
      toolUseTurn([
        { id: "a", name: "get_hub_risk", input: { hub: "miami" } },
        { id: "b", name: "get_hub_risk", input: { hub: "houston" } },
      ]),
      answerTurn(makeAnswer()),
    ]);
    await runAgent({ message: "Miami and Houston", callModel, context, today });
    const last = requests[1].messages[requests[1].messages.length - 1];
    expect((last.content as unknown[]).length).toBe(2);
  });

  it("sends a failing tool back as an error result so the model can recover", async () => {
    const { callModel, requests } = scriptedModel([
      toolUseTurn([{ id: "t1", name: "get_hub_risk", input: { hub: "paris" } }]),
      answerTurn(makeAnswer({ in_scope: false })),
    ]);
    const result = await runAgent({ message: "Paris?", callModel, context, today });
    expect(result.toolCalls[0].error).toMatch(/Invalid input/);
    const last = requests[1].messages[requests[1].messages.length - 1];
    expect((last.content as Anthropic.ToolResultBlockParam[])[0].is_error).toBe(true);
  });

  it("includes earlier turns as plain question/answer pairs", async () => {
    const { callModel, requests } = scriptedModel([answerTurn(makeAnswer())]);
    const earlier = makeAnswer({ answer: "Earlier answer" });
    await runAgent({ message: "And Detroit?", history: [{ userMessage: "Midwest winter?", answer: earlier }], callModel, context, today });
    const messages = requests[0].messages;
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[1].content).toContain("Earlier answer");
  });

  it("puts today's date in the system prompt", async () => {
    const { callModel, requests } = scriptedModel([answerTurn(makeAnswer())]);
    await runAgent({ message: "hi", callModel, context, today });
    expect(requests[0].system).toContain("2026-11-17");
  });
});

describe("runAgent: grounding", () => {
  const ranking = (score: number) => [{ rank: 1, hub_id: "minneapolis" as const, metric: "winter" as const, score, note: "" }];

  it("corrects a wrong ranking score from the engine and reports it", async () => {
    const { callModel } = scriptedModel([toolUseTurn([rankMidwest]), answerTurn(makeAnswer({ ranking: ranking(12.3) }))]);
    const result = await runAgent({ message: "Midwest winter?", callModel, context, today });
    expect(result.answer.ranking[0].score).toBeGreaterThan(50);
    expect(result.corrections[0]).toContain("minneapolis winter score changed from 12.3");
  });

  it("asks the model once to fix a figure no tool returned", async () => {
    const bad = makeAnswer({ figures: [{ label: "invented", value: 77.7, unit: "%" }] });
    const { callModel, requests } = scriptedModel([toolUseTurn([rankMidwest]), answerTurn(bad), answerTurn(makeAnswer())]);
    const result = await runAgent({ message: "Midwest winter?", callModel, context, today });
    expect(requests).toHaveLength(3);
    const feedback = requests[2].messages[requests[2].messages.length - 1].content as string;
    expect(feedback).toContain("invented");
    expect(result.answer.figures).toEqual([]);
    expect(result.corrections).toEqual([]);
  });

  it("drops a figure that is still ungrounded after the retry", async () => {
    const bad = makeAnswer({ figures: [{ label: "invented", value: 77.7, unit: "%" }] });
    const { callModel } = scriptedModel([toolUseTurn([rankMidwest]), answerTurn(bad), answerTurn(bad)]);
    const result = await runAgent({ message: "Midwest winter?", callModel, context, today });
    expect(result.answer.figures).toEqual([]);
    expect(result.answer.data_gaps[0]).toContain("removed");
    expect(result.corrections).toContain("removed 1 ungrounded figure(s)");
  });
});

describe("runAgent: failure paths", () => {
  it("returns a declined answer when the model refuses", async () => {
    const { callModel } = scriptedModel([{ ...answerTurn(null, "refusal"), parsedAnswer: null }]);
    const result = await runAgent({ message: "x", callModel, context, today });
    expect(result.answer.in_scope).toBe(false);
    expect(result.answer.confidence).toBe("low");
  });

  it("fails clearly when the answer does not match the schema", async () => {
    const { callModel } = scriptedModel([answerTurn({ answer: "missing everything else" })]);
    await expect(runAgent({ message: "x", callModel, context, today })).rejects.toThrow(AgentError);
  });

  it("fails clearly when the answer is cut off", async () => {
    const { callModel } = scriptedModel([answerTurn(makeAnswer(), "max_tokens")]);
    await expect(runAgent({ message: "x", callModel, context, today })).rejects.toThrow(/cut off/);
  });

  it("stops a model that keeps calling tools", async () => {
    const loop = Array.from({ length: 10 }, () => toolUseTurn([rankMidwest]));
    const { callModel } = scriptedModel(loop);
    await expect(runAgent({ message: "x", callModel, context, today })).rejects.toThrow(/too many tool rounds/);
  });
});
